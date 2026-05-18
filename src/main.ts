import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('App root not found');
}

const app = root;
let snapshot: UsageSnapshot | null = null;
let refreshing = false;

function levelLabel(level: UsageLevel): string {
  switch (level) {
    case 'ok':
      return 'OK';
    case 'warning':
      return 'Warning';
    case 'critical':
      return 'Critical';
    case 'depleted':
      return 'Depleted';
  }
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

function renderWindow(window: UsageWindow, updatedAtUnix: number | null): string {
  const percent = Math.max(0, Math.min(100, window.usedPercent));
  return `
    <section class="usage-card usage-card--${window.state}">
      <div class="usage-card__header">
        <span>${window.label}</span>
        <strong>${percent}%</strong>
      </div>
      <div class="meter" aria-label="${window.label} usage">
        <span style="width: ${percent}%"></span>
      </div>
      <div class="usage-card__footer">
        <span>${levelLabel(window.state)}</span>
        <span>resets in ${formatCountdown(remainingSeconds(window, updatedAtUnix))}</span>
      </div>
    </section>
  `;
}

function render(): void {
  if (!snapshot || snapshot.status === 'loading') {
    app.innerHTML = `
      <section class="shell">
        <header class="topbar">
          <div>
            <h1>Codem</h1>
            <p>Codex + meter</p>
          </div>
          <span class="pill">Loading</span>
        </header>
        <div class="empty">Loading Codex usage...</div>
      </section>
    `;
    return;
  }

  const account = snapshot.account;
  const isReady = snapshot.status === 'ready' && snapshot.primary && snapshot.secondary;
  const statusText = snapshot.status === 'ready' ? snapshot.trayTitle : 'Codem ERR';

  app.innerHTML = `
    <section class="shell">
      <header class="topbar">
        <div>
          <h1>Codem</h1>
          <p>Codex + meter</p>
        </div>
        <span class="pill">${statusText}</span>
      </header>

      ${
        isReady
          ? `
            <div class="grid">
              ${renderWindow(snapshot.primary!, snapshot.updatedAtUnix)}
              ${renderWindow(snapshot.secondary!, snapshot.updatedAtUnix)}
            </div>
          `
          : `<div class="error">${snapshot.error ?? 'Unable to load usage.'}</div>`
      }

      <section class="details">
        <div>
          <span>Account</span>
          <strong>${account?.email ?? 'unknown'}</strong>
        </div>
        <div>
          <span>Plan</span>
          <strong>${account?.planType?.toUpperCase() ?? 'unknown'}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>${account?.allowed === false ? 'Rate Limited' : snapshot.status === 'ready' ? 'Active' : 'Error'}</strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>${formatUpdatedAt(snapshot.updatedAtUnix)}</strong>
        </div>
      </section>

      <footer class="actions">
        <button id="refresh" type="button" ${refreshing ? 'disabled' : ''}>${refreshing ? 'Refreshing...' : 'Refresh'}</button>
      </footer>
    </section>
  `;

  document.querySelector<HTMLButtonElement>('#refresh')?.addEventListener('click', () => {
    void refreshNow();
  });
}

async function refreshNow(): Promise<void> {
  refreshing = true;
  render();
  try {
    snapshot = await invoke<UsageSnapshot>('refresh_now');
  } finally {
    refreshing = false;
    render();
  }
}

async function boot(): Promise<void> {
  snapshot = await invoke<UsageSnapshot>('get_snapshot');
  render();

  await listen<UsageSnapshot>('usage://updated', (event) => {
    snapshot = event.payload;
    render();
  });

  window.setInterval(render, 1000);
}

void boot();
