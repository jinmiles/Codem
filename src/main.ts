import './styles.css';

type UsageLevel = 'ok' | 'warning' | 'critical' | 'depleted';
type SnapshotStatus = 'loading' | 'ready' | 'error';

type UsageWindow = {
  label: string;
  usedPercent: number;
  resetAfterSeconds: number;
  resetAt: number;
  state: UsageLevel;
};

type Account = {
  email: string | null;
  planType: string | null;
  allowed: boolean | null;
};

type UsageSnapshot = {
  status: SnapshotStatus;
  primary: UsageWindow | null;
  secondary: UsageWindow | null;
  account: Account | null;
  error: string | null;
  updatedAtUnix: number | null;
  trayTitle: string;
};

type UsageUpdatedHandler = (snapshot: UsageSnapshot) => void;

type CodemBridge = {
  getSnapshot: () => Promise<UsageSnapshot>;
  refreshNow: () => Promise<UsageSnapshot>;
  onUsageUpdated: (handler: UsageUpdatedHandler) => Promise<() => void> | (() => void);
};

declare global {
  interface Window {
    codem?: CodemBridge;
  }
}

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('App root not found');
}

const app = root;
let snapshot: UsageSnapshot | null = null;
let refreshing = false;

const APP_NAME = 'Codem';
const APP_TAGLINE = 'Codex + meter';
const LOADING_TITLE = 'Loading';
const ERROR_TITLE = 'Codem ERR';
const UNKNOWN_VALUE = 'unknown';

const LEVEL_LABELS: Record<UsageLevel, string> = {
  ok: 'OK',
  warning: 'Warning',
  critical: 'Critical',
  depleted: 'Depleted',
};

async function getBridge(): Promise<CodemBridge> {
  if (window.codem) {
    return window.codem;
  }

  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ]);

  return {
    getSnapshot: () => invoke<UsageSnapshot>('get_snapshot'),
    refreshNow: () => invoke<UsageSnapshot>('refresh_now'),
    onUsageUpdated: async (handler) => {
      const unlisten = await listen<UsageSnapshot>('usage://updated', (event) => {
        handler(event.payload);
      });
      return unlisten;
    },
  };
}

function levelLabel(level: UsageLevel): string {
  return LEVEL_LABELS[level];
}

function formatCountdown(seconds: number): string {
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

function remainingSeconds(window: UsageWindow, updatedAtUnix: number | null): number {
  if (!updatedAtUnix) return Math.max(0, window.resetAfterSeconds);
  const elapsed = Math.floor(Date.now() / 1000) - updatedAtUnix;
  return Math.max(0, window.resetAfterSeconds - elapsed);
}

function formatUpdatedAt(updatedAtUnix: number | null): string {
  if (!updatedAtUnix) return '--';
  return new Date(updatedAtUnix * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderWindow(window: UsageWindow, updatedAtUnix: number | null): string {
  const percent = Math.max(0, Math.min(100, window.usedPercent));
  const label = escapeHtml(window.label);
  return `
    <section class="usage-card usage-card--${window.state}">
      <div class="usage-card__header">
        <span>${label}</span>
        <strong>${percent}%</strong>
      </div>
      <div class="meter" aria-label="${label} usage">
        <span style="width: ${percent}%"></span>
      </div>
      <div class="usage-card__footer">
        <span>${levelLabel(window.state)}</span>
        <span>resets in ${formatCountdown(remainingSeconds(window, updatedAtUnix))}</span>
      </div>
    </section>
  `;
}

function renderTopbar(title: string): string {
  return `
    <header class="topbar">
      <div>
        <h1>${APP_NAME}</h1>
        <p>${APP_TAGLINE}</p>
      </div>
      <span class="pill">${escapeHtml(title)}</span>
    </header>
  `;
}

function renderDetails(snapshot: UsageSnapshot): string {
  const account = snapshot.account;
  const accountStatus =
    account?.allowed === false ? 'Rate Limited' : snapshot.status === 'ready' ? 'Active' : 'Error';

  return `
    <section class="details">
      <div>
        <span>Account</span>
        <strong>${escapeHtml(account?.email ?? UNKNOWN_VALUE)}</strong>
      </div>
      <div>
        <span>Plan</span>
        <strong>${escapeHtml(account?.planType?.toUpperCase() ?? UNKNOWN_VALUE)}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong>${accountStatus}</strong>
      </div>
      <div>
        <span>Updated</span>
        <strong>${formatUpdatedAt(snapshot.updatedAtUnix)}</strong>
      </div>
    </section>
  `;
}

function renderShell(title: string, body: string): void {
  app.innerHTML = `
    <section class="shell">
      ${renderTopbar(title)}
      ${body}
    </section>
  `;
}

function render(): void {
  if (!snapshot || snapshot.status === 'loading') {
    renderShell(LOADING_TITLE, '<div class="empty">Loading Codex usage...</div>');
    return;
  }

  const primary = snapshot.primary;
  const secondary = snapshot.secondary;
  const hasUsage = snapshot.status === 'ready' && primary !== null && secondary !== null;
  const statusText = snapshot.status === 'ready' ? snapshot.trayTitle : ERROR_TITLE;
  const usageGrid =
    hasUsage
      ? `
        <div class="grid">
          ${renderWindow(primary, snapshot.updatedAtUnix)}
          ${renderWindow(secondary, snapshot.updatedAtUnix)}
        </div>
      `
      : `<div class="error">${escapeHtml(snapshot.error ?? 'Unable to load usage.')}</div>`;
  const body = `
    ${usageGrid}

    ${renderDetails(snapshot)}

    <footer class="actions">
      <button id="refresh" type="button" ${refreshing ? 'disabled' : ''}>${refreshing ? 'Refreshing...' : 'Refresh'}</button>
    </footer>
  `;

  renderShell(statusText, body);

  document.querySelector<HTMLButtonElement>('#refresh')?.addEventListener('click', () => {
    void refreshNow();
  });
}

async function refreshNow(): Promise<void> {
  refreshing = true;
  render();
  try {
    const bridge = await getBridge();
    snapshot = await bridge.refreshNow();
  } finally {
    refreshing = false;
    render();
  }
}

async function boot(): Promise<void> {
  const bridge = await getBridge();
  snapshot = await bridge.getSnapshot();
  render();

  await bridge.onUsageUpdated((next) => {
    snapshot = next;
    render();
  });

  window.setInterval(render, 1000);
}

void boot();
