# AGENTS.md

Instructions for AI coding agents working in this repository.

## Mission

Codem is a lightweight cross-platform Codex usage meter built with Tauri. It
reads local Codex auth, polls the Codex usage API, and displays 5-hour plus
weekly usage from the Linux system tray or macOS menu bar.

## Ground Rules

* Read relevant code before editing.
* Preserve user changes. Check `git status --short` before editing.
* Keep comments, logs, and UI strings in English.
* Do not add emoji to source files.
* Do not commit generated artifacts, caches, build outputs, binaries, logs,
  screenshots, local credentials, or secrets.
* Avoid dependency upgrades unless the task requires them.
* Keep the runtime small. Do not add Electron, large UI frameworks, or broad
  background services without explicit user approval.

## Project Overview

Codem reads:

```text
~/.codex/auth.json
```

Token path:

```text
tokens.access_token
```

API endpoint:

```text
GET https://chatgpt.com/backend-api/wham/usage
```

Expected usage shape:

```json
{
  "rate_limit": {
    "primary_window": {
      "used_percent": 73,
      "limit_window_seconds": 18000,
      "reset_after_seconds": 13046,
      "reset_at": 1779089766
    },
    "secondary_window": {
      "used_percent": 11,
      "limit_window_seconds": 604800,
      "reset_after_seconds": 599846,
      "reset_at": 1779676566
    }
  }
}
```

## Repository Structure

```text
Codem/
├── src/                    # Vite TypeScript frontend
├── src-tauri/              # Tauri Rust desktop app
│   ├── src/lib.rs          # tray menu, polling loop, Tauri commands
│   ├── src/main.rs         # entry point and --self-test
│   ├── src/usage.rs        # auth reading, API fetch, formatting, tests
│   ├── tauri.conf.json     # app metadata and bundle targets
│   └── capabilities/       # Tauri desktop permissions
├── .github/workflows/      # Linux/macOS build and release workflow
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md
```

## Environment

* Use npm for frontend and Tauri CLI dependencies.
* Use Rust stable for the Tauri backend.
* Use Tauri v2 APIs.
* Use Vite for the small TypeScript frontend.
* Keep platform-specific tray behavior in Rust under `src-tauri/`.
* Keep frontend code focused on rendering status and sending explicit commands.

## Common Commands

Install dependencies:

```bash
npm ci
```

Build frontend:

```bash
npm run build
```

Run the app during development:

```bash
npm run tauri dev
```

Build desktop bundles:

```bash
npm run tauri:build
```

Run validation:

```bash
npm test
cargo run --manifest-path src-tauri/Cargo.toml -- --self-test
```

## Validation

Use the smallest validation that covers the change:

* Frontend-only change: `npm run check` and `npm run build`
* Rust backend change: `cargo test --manifest-path src-tauri/Cargo.toml`
* Tauri integration change: `npm run tauri:build` on Linux/macOS when feasible
* Release/workflow change: confirm the GitHub Actions run for Linux and macOS

If validation cannot run because system packages, GNOME/AppIndicator, macOS,
credentials, or network access are unavailable, state that clearly.

## Coding Style

* Keep Rust logic explicit and small.
* Keep API parsing structured with `serde`.
* Keep polling at 60 seconds unless the user asks to change it.
* Keep local countdown display ticking in the frontend once per second.
* Do not log auth tokens, raw auth files, or raw API payloads.
* Preserve threshold behavior:

| Range | State |
| --- | --- |
| 0-59% | ok |
| 60-79% | warning |
| 80-94% | critical |
| 95%+ | depleted |

## Git And Commits

* Do not commit without explicit user confirmation.
* Before committing, inspect `git status --short`.
* Stage only intended changes.
* Write commit messages in English.
* Prefer concise conventional commits, such as:

```text
feat: migrate Codem to Tauri
```

## Safety

* Never commit real Codex auth contents.
* Use placeholder values in examples.
* Do not make unsupported claims about runtime behavior on desktop environments
  that were not actually tested.
