const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let tray;
let isQuitting = false;

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const winWidth  = 360;
  const winHeight = 440;

  win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: sw - winWidth - 16,
    y: sh - winHeight - 16,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false, // held until ready-to-show to avoid white flash on Windows
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Show only after first paint — prevents blank/transparent flash on Windows
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  win.loadFile('index.html');

  // Intercept close to hide to tray instead of quitting
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  // Packaged: icons are copied outside the asar via extraResources → resources/icons/
  // Dev:      __dirname is the project root
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icons', 'icon.ico')
    : path.join(__dirname, 'icons', 'icon.ico');

  console.log('[Tray] resolved icon path:', iconPath);

  if (!fs.existsSync(iconPath)) {
    console.error('[Tray] ERROR: file not found at', iconPath);
    console.error('[Tray] Ensure icons/icon.ico exists and extraResources is set in package.json');
    return;
  }

  const trayIcon = nativeImage.createFromPath(iconPath);

  if (trayIcon.isEmpty()) {
    console.error('[Tray] ERROR: nativeImage is empty — the .ico file may be corrupt');
    return;
  }

  tray = new Tray(trayIcon);
  console.log('[Tray] created successfully');
  tray.setToolTip('PokeDoro');

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click() {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click() {
        isQuitting = true;
        app.quit();
      },
    },
  ]));

  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
}

// ── Single-instance guard ────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[App] Second instance detected — quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createTray();    // tray first — claims the Shell notification slot before the window loads
    createWindow();
  });

  app.on('window-all-closed', () => {
    // Intentionally empty: tray keeps the process alive on Windows
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });
}

// IPC from renderer
ipcMain.on('close-window',    () => win.hide());
ipcMain.on('minimise-window', () => win.minimize());
