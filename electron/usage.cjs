const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const USER_AGENT_VALUE = 'Codem/0.1.1 Electron';
const TRAY_LOADING_TITLE = 'Codem --';
const TRAY_ERROR_TITLE = 'Codem ERR';
const PRIMARY_WINDOW_LABEL = '5H LIMIT';
const SECONDARY_WINDOW_LABEL = 'WEEKLY LIMIT';

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function levelForPercent(percent) {
  if (percent <= 59) return 'ok';
  if (percent <= 79) return 'warning';
  if (percent <= 94) return 'critical';
  return 'depleted';
}

function coercePercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function coerceSeconds(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function windowFromData(label, data) {
  const usedPercent = coercePercent(data?.used_percent);
  return {
    label,
    usedPercent,
    resetAfterSeconds: coerceSeconds(data?.reset_after_seconds),
    resetAt: coerceSeconds(data?.reset_at),
    state: levelForPercent(usedPercent),
  };
}

function buildLoadingSnapshot() {
  return {
    status: 'loading',
    primary: null,
    secondary: null,
    account: null,
    error: null,
    updatedAtUnix: null,
    trayTitle: TRAY_LOADING_TITLE,
  };
}

function buildErrorSnapshot(error) {
  return {
    status: 'error',
    primary: null,
    secondary: null,
    account: null,
    error,
    updatedAtUnix: nowUnix(),
    trayTitle: TRAY_ERROR_TITLE,
  };
}

function snapshotFromUsage(usage) {
  const rateLimit = usage?.rate_limit;
  if (!rateLimit?.primary_window || !rateLimit?.secondary_window) {
    throw new Error('usage response missing rate_limit windows');
  }

  const primary = windowFromData(PRIMARY_WINDOW_LABEL, rateLimit.primary_window);
  const secondary = windowFromData(SECONDARY_WINDOW_LABEL, rateLimit.secondary_window);

  return {
    status: 'ready',
    primary,
    secondary,
    account: {
      email: usage.email ?? null,
      planType: usage.plan_type ?? null,
      allowed: rateLimit.allowed ?? null,
    },
    error: null,
    updatedAtUnix: nowUnix(),
    trayTitle: `Codem ${primary.usedPercent}% · ${secondary.usedPercent}%`,
  };
}

function formatCountdown(seconds) {
  if (seconds <= 0) return 'resetting soon';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function tooltipForSnapshot(snapshot) {
  if (snapshot.primary && snapshot.secondary) {
    return `${snapshot.primary.label}: ${snapshot.primary.usedPercent}% · ${snapshot.secondary.label}: ${snapshot.secondary.usedPercent}%`;
  }
  if (snapshot.error) {
    return `Codem error: ${snapshot.error}`;
  }
  return 'Codem loading';
}

function authPath() {
  return path.join(os.homedir(), '.codex', 'auth.json');
}

function readAccessToken() {
  const filePath = authPath();
  const content = fs.readFileSync(filePath, 'utf8');
  const auth = JSON.parse(content);
  const token = auth?.tokens?.access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('access_token not found');
  }
  return token;
}

async function fetchUsageSnapshot(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this runtime');
  }

  const response = await fetchImpl(USAGE_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${readAccessToken()}`,
      'User-Agent': USER_AGENT_VALUE,
    },
  });

  if (!response.ok) {
    throw new Error(`request failed: HTTP ${response.status}`);
  }

  const usage = await response.json();
  return snapshotFromUsage(usage);
}

function runSelfTest() {
  const snapshot = snapshotFromUsage({
    email: 'test@example.com',
    plan_type: 'plus',
    rate_limit: {
      allowed: true,
      primary_window: {
        used_percent: 73,
        reset_after_seconds: 13046,
        reset_at: 1779089766,
      },
      secondary_window: {
        used_percent: 11,
        reset_after_seconds: 599846,
        reset_at: 1779676566,
      },
    },
  });

  if (snapshot.trayTitle !== 'Codem 73% · 11%') {
    throw new Error('tray title formatting failed');
  }
  if (formatCountdown(65) !== '1m 5s') {
    throw new Error('countdown formatting failed');
  }
  if (levelForPercent(95) !== 'depleted') {
    throw new Error('usage level threshold failed');
  }
}

async function runFetchProbe() {
  const snapshot = await fetchUsageSnapshot();
  const plan = snapshot.account?.planType?.toUpperCase() ?? 'unknown plan';
  console.log(`${snapshot.trayTitle} (${plan})`);
  console.log(`5H resets in ${formatCountdown(snapshot.primary.resetAfterSeconds)}`);
  console.log(`Weekly resets in ${formatCountdown(snapshot.secondary.resetAfterSeconds)}`);
}

if (require.main === module) {
  const command = process.argv[2];
  Promise.resolve()
    .then(async () => {
      if (command === '--fetch') {
        await runFetchProbe();
        return;
      }
      runSelfTest();
      console.log('Codem Electron self-test passed');
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = {
  TRAY_LOADING_TITLE,
  buildErrorSnapshot,
  buildLoadingSnapshot,
  fetchUsageSnapshot,
  runSelfTest,
  tooltipForSnapshot,
};
