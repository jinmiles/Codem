use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::header::{ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};

const USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
const USER_AGENT_VALUE: &str = "Codem/0.1.1 Tauri";
pub const TRAY_LOADING_TITLE: &str = "Codem --";
const TRAY_ERROR_TITLE: &str = "Codem ERR";
const PRIMARY_WINDOW_LABEL: &str = "5H LIMIT";
const SECONDARY_WINDOW_LABEL: &str = "WEEKLY LIMIT";

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotStatus {
    Loading,
    Ready,
    Error,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UsageLevel {
    Ok,
    Warning,
    Critical,
    Depleted,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub label: String,
    pub used_percent: u8,
    pub reset_after_seconds: i64,
    pub reset_at: i64,
    pub state: UsageLevel,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub email: Option<String>,
    pub plan_type: Option<String>,
    pub allowed: Option<bool>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub status: SnapshotStatus,
    pub primary: Option<UsageWindow>,
    pub secondary: Option<UsageWindow>,
    pub account: Option<Account>,
    pub error: Option<String>,
    pub updated_at_unix: Option<u64>,
    pub tray_title: String,
}

#[derive(Debug, Deserialize)]
struct AuthData {
    tokens: Option<AuthTokens>,
}

#[derive(Debug, Deserialize)]
struct AuthTokens {
    access_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UsageResponse {
    email: Option<String>,
    plan_type: Option<String>,
    rate_limit: RateLimit,
}

#[derive(Debug, Deserialize)]
struct RateLimit {
    allowed: Option<bool>,
    primary_window: WindowData,
    secondary_window: WindowData,
}

#[derive(Debug, Deserialize)]
struct WindowData {
    used_percent: u8,
    reset_after_seconds: i64,
    reset_at: i64,
}

pub async fn fetch_usage_snapshot(client: &reqwest::Client) -> Result<UsageSnapshot, String> {
    let token = read_access_token()?;
    let response = client
        .get(USAGE_URL)
        .bearer_auth(token)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("request failed: HTTP {status}"));
    }

    let usage = response
        .json::<UsageResponse>()
        .await
        .map_err(|error| format!("parse failed: {error}"))?;

    Ok(snapshot_from_usage(usage))
}

pub fn build_loading_snapshot() -> UsageSnapshot {
    UsageSnapshot {
        status: SnapshotStatus::Loading,
        primary: None,
        secondary: None,
        account: None,
        error: None,
        updated_at_unix: None,
        tray_title: TRAY_LOADING_TITLE.to_string(),
    }
}

pub fn build_error_snapshot(error: String) -> UsageSnapshot {
    UsageSnapshot {
        status: SnapshotStatus::Error,
        primary: None,
        secondary: None,
        account: None,
        error: Some(error),
        updated_at_unix: Some(now_unix()),
        tray_title: TRAY_ERROR_TITLE.to_string(),
    }
}

pub fn run_self_test() -> Result<(), String> {
    let token = extract_access_token(r#"{"tokens":{"access_token":"test-token"}}"#)?;
    if token != "test-token" {
        return Err("access token extraction failed".to_string());
    }

    let usage = serde_json::from_str::<UsageResponse>(
        r#"{
          "email": "test@example.com",
          "plan_type": "plus",
          "rate_limit": {
            "allowed": true,
            "primary_window": {
              "used_percent": 73,
              "reset_after_seconds": 13046,
              "reset_at": 1779089766
            },
            "secondary_window": {
              "used_percent": 11,
              "reset_after_seconds": 599846,
              "reset_at": 1779676566
            }
          }
        }"#,
    )
    .map_err(|error| format!("usage fixture failed: {error}"))?;

    let snapshot = snapshot_from_usage(usage);
    if snapshot.tray_title != "Codem 73% · 11%" {
        return Err("tray title formatting failed".to_string());
    }
    if format_countdown(65) != "1m 5s" {
        return Err("countdown formatting failed".to_string());
    }
    if level_for_percent(95) != UsageLevel::Depleted {
        return Err("usage level threshold failed".to_string());
    }
    Ok(())
}

fn snapshot_from_usage(usage: UsageResponse) -> UsageSnapshot {
    let primary = window_from_data(PRIMARY_WINDOW_LABEL, usage.rate_limit.primary_window);
    let secondary = window_from_data(SECONDARY_WINDOW_LABEL, usage.rate_limit.secondary_window);
    let tray_title = format!("Codem {}% · {}%", primary.used_percent, secondary.used_percent);

    UsageSnapshot {
        status: SnapshotStatus::Ready,
        primary: Some(primary),
        secondary: Some(secondary),
        account: Some(Account {
            email: usage.email,
            plan_type: usage.plan_type,
            allowed: usage.rate_limit.allowed,
        }),
        error: None,
        updated_at_unix: Some(now_unix()),
        tray_title,
    }
}

fn window_from_data(label: &str, data: WindowData) -> UsageWindow {
    UsageWindow {
        label: label.to_string(),
        used_percent: data.used_percent,
        reset_after_seconds: data.reset_after_seconds,
        reset_at: data.reset_at,
        state: level_for_percent(data.used_percent),
    }
}

fn level_for_percent(percent: u8) -> UsageLevel {
    match percent {
        0..=59 => UsageLevel::Ok,
        60..=79 => UsageLevel::Warning,
        80..=94 => UsageLevel::Critical,
        _ => UsageLevel::Depleted,
    }
}

pub fn format_countdown(seconds: i64) -> String {
    if seconds <= 0 {
        return "resetting soon".to_string();
    }
    let days = seconds / 86400;
    let hours = (seconds % 86400) / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    if days > 0 {
        return format!("{days}d {hours}h {minutes}m");
    }
    if hours > 0 {
        return format!("{hours}h {minutes}m");
    }
    if minutes > 0 {
        return format!("{minutes}m {secs}s");
    }
    format!("{secs}s")
}

impl UsageSnapshot {
    pub fn tooltip(&self) -> String {
        match (&self.primary, &self.secondary, &self.error) {
            (Some(primary), Some(secondary), _) => format!(
                "{}: {}% · {}: {}%",
                primary.label, primary.used_percent, secondary.label, secondary.used_percent
            ),
            (_, _, Some(error)) => format!("Codem error: {error}"),
            _ => "Codem loading".to_string(),
        }
    }
}

fn read_access_token() -> Result<String, String> {
    let path = auth_path()?;
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    extract_access_token(&content)
}

fn extract_access_token(content: &str) -> Result<String, String> {
    let auth: AuthData =
        serde_json::from_str(content).map_err(|error| format!("auth parse failed: {error}"))?;
    auth.tokens
        .and_then(|tokens| tokens.access_token)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "access_token not found".to_string())
}

fn auth_path() -> Result<PathBuf, String> {
    if let Ok(home) = env::var("HOME") {
        return Ok(PathBuf::from(home).join(".codex/auth.json"));
    }
    if let Ok(profile) = env::var("USERPROFILE") {
        return Ok(PathBuf::from(profile).join(".codex/auth.json"));
    }
    Err("home directory not found".to_string())
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_access_token() {
        let token = extract_access_token(r#"{"tokens":{"access_token":"abc"}}"#).unwrap();
        assert_eq!(token, "abc");
    }

    #[test]
    fn formats_countdown() {
        assert_eq!(format_countdown(0), "resetting soon");
        assert_eq!(format_countdown(59), "59s");
        assert_eq!(format_countdown(65), "1m 5s");
        assert_eq!(format_countdown(3660), "1h 1m");
        assert_eq!(format_countdown(90061), "1d 1h 1m");
    }

    #[test]
    fn classifies_usage_levels() {
        assert_eq!(level_for_percent(59), UsageLevel::Ok);
        assert_eq!(level_for_percent(60), UsageLevel::Warning);
        assert_eq!(level_for_percent(80), UsageLevel::Critical);
        assert_eq!(level_for_percent(95), UsageLevel::Depleted);
    }
}
