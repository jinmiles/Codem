const path = require('node:path');

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } = require('electron');
const {
  TRAY_LOADING_TITLE,
  buildErrorSnapshot,
  buildLoadingSnapshot,
  fetchUsageSnapshot,
  tooltipForSnapshot,
} = require('./usage.cjs');

const POLL_SECONDS = 60;
const WINDOW_WIDTH = 420;
const WINDOW_HEIGHT = 560;
const RUN_CHECK = process.env.CODEM_RUN_CHECK === '1';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-accelerated-video-decode');
  app.commandLine.appendSwitch('disable-accelerated-video-encode');
  app.commandLine.appendSwitch('disable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
  app.commandLine.appendSwitch('log-level', '3');
  app.disableHardwareAcceleration();
}

let mainWindow = null;
let tray = null;
let snapshot = buildLoadingSnapshot();
let pollingTimer = null;
let isQuitting = false;

function iconPath() {
  return path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.png');
}

function appIcon() {
  return nativeImage.createFromPath(iconPath());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 360,
    minHeight: 520,
    resizable: false,
    title: 'Codem',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  tray = new Tray(appIcon().resize({ width: 18, height: 18 }));
  tray.setTitle(TRAY_LOADING_TITLE);
  tray.setToolTip('Codem');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Codem', click: showMainWindow },
      { label: 'Refresh', click: () => void refreshAndPublish() },
      { type: 'separator' },
      {
        label: 'Quit Codem',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
  }
  mainWindow.show();
  mainWindow.focus();
}

function updateTray(next) {
  if (!tray) return;
  tray.setTitle(next.trayTitle);
  tray.setToolTip(tooltipForSnapshot(next));
}

function publishSnapshot(next) {
  snapshot = next;
  updateTray(snapshot);
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('usage://updated', snapshot);
  });
}

async function refreshAndPublish() {
  try {
    publishSnapshot(await fetchUsageSnapshot());
  } catch (error) {
    publishSnapshot(buildErrorSnapshot(error instanceof Error ? error.message : String(error)));
  }
  finishRunCheck(snapshot);
  return snapshot;
}

function finishRunCheck(next) {
  if (!RUN_CHECK) return;

  if (next.status === 'ready') {
    console.log(`Codem run check passed: ${next.trayTitle}`);
    app.exit(0);
    return;
  }

  if (next.status === 'error') {
    console.error(`Codem run check failed: ${next.error ?? 'unknown error'}`);
    app.exit(1);
  }
}

function startPolling() {
  void refreshAndPublish();
  pollingTimer = setInterval(() => {
    void refreshAndPublish();
  }, POLL_SECONDS * 1000);
}

ipcMain.handle('codem:get_snapshot', () => snapshot);
ipcMain.handle('codem:refresh_now', () => refreshAndPublish());

app.whenReady().then(() => {
  createWindow();
  createTray();
  startPolling();

  app.on('activate', showMainWindow);
});

app.on('before-quit', () => {
  isQuitting = true;
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
