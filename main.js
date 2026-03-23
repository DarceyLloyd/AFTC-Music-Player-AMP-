import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron';
import Store from 'electron-store';
import trash from 'trash';
import { collectFromMixedPaths, scanFolderRecursive } from './utils/fileScanner.js';
import { readMetadataBatch } from './utils/metadataReader.js';
import { writeTrackRating } from './utils/ratingWriter.js';
import { sanitizeAndValidatePaths, isProtectedPath } from './utils/pathPolicy.js';
import { destroyTray, ensureTray } from './utils/tray.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, 'config.json');
const APP_TITLE = 'AFTC Music Player';
const APP_WINDOW_TITLE = `${APP_TITLE} v${app.getVersion()}`;

const DEFAULT_APP_CONFIG = {
  ui: {
    playlistScrollDurationSeconds: 0.5,
    startupScrollDurationSeconds: 1,
    infoToggleDurationSeconds: 0.18
  }
};

const store = new Store({
  defaults: {
    volume: 75,
    playlist: [],
    lastTrackPath: null,
    windowBounds: null,
    windowDisplay: null
  }
});

let mainWindow;
let isQuitting = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function restoreAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  // Show is required when the app is hidden to tray.
  mainWindow.show();
  mainWindow.focus();
}

function clampScrollDuration(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(10, Math.max(0, numeric));
}

async function loadAppConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const ui = parsed?.ui || {};

    return {
      ui: {
        playlistScrollDurationSeconds: clampScrollDuration(
          ui.playlistScrollDurationSeconds,
          DEFAULT_APP_CONFIG.ui.playlistScrollDurationSeconds
        ),
        startupScrollDurationSeconds: clampScrollDuration(
          ui.startupScrollDurationSeconds,
          DEFAULT_APP_CONFIG.ui.startupScrollDurationSeconds
        ),
        infoToggleDurationSeconds: clampScrollDuration(
          ui.infoToggleDurationSeconds,
          DEFAULT_APP_CONFIG.ui.infoToggleDurationSeconds
        )
      }
    };
  } catch {
    return DEFAULT_APP_CONFIG;
  }
}

async function moveTrackToTrash(trackPath) {
  try {
    await trash([trackPath]);
    return;
  } catch (error) {
    const helperMissing =
      error?.code === 'ENOENT' &&
      typeof error?.message === 'string' &&
      error.message.toLowerCase().includes('windows-trash.exe');

    // Packaged apps can fail to spawn recycle-bin helper if it is not unpacked.
    // Fallback to Electron's native trash API to keep delete behavior reliable.
    if (!helperMissing) {
      throw error;
    }

    await shell.trashItem(trackPath);
  }
}

function getDisplayFingerprint(display) {
  return {
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor
  };
}

function getInitialBounds() {
  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workAreaSize;
  const width = Math.floor(workArea.width * 0.75);
  const height = Math.floor(workArea.height * 0.75);

  const currentDisplay = getDisplayFingerprint(primary);
  const savedDisplay = store.get('windowDisplay');
  const savedBounds = store.get('windowBounds');

  const displayChanged =
    !savedDisplay ||
    savedDisplay.width !== currentDisplay.width ||
    savedDisplay.height !== currentDisplay.height ||
    savedDisplay.scaleFactor !== currentDisplay.scaleFactor;

  if (displayChanged) {
    store.delete('windowBounds');
    store.set('windowDisplay', currentDisplay);
    return { width, height, center: true };
  }

  if (savedBounds && Number.isFinite(savedBounds.width) && Number.isFinite(savedBounds.height)) {
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return (
        savedBounds.x + savedBounds.width > area.x &&
        savedBounds.x < area.x + area.width &&
        savedBounds.y + savedBounds.height > area.y &&
        savedBounds.y < area.y + area.height
      );
    });

    if (visible) {
      return { ...savedBounds, center: false };
    }

    store.delete('windowBounds');
  }

  return { width, height, center: true };
}

function createWindow() {
  const initial = getInitialBounds();

  mainWindow = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x: initial.center ? undefined : initial.x,
    y: initial.center ? undefined : initial.y,
    center: initial.center,
    icon: path.join(__dirname, 'src', 'assets', 'icons', 'icon.ico'),
    minWidth: 980,
    minHeight: 620,
    title: APP_WINDOW_TITLE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const saveWindowBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    store.set('windowBounds', mainWindow.getBounds());
  };

  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
    ensureTray(mainWindow);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      isQuitting = true;
      app.quit();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.on('page-title-updated', (event) => {
    // Keep native window title consistent with package version.
    event.preventDefault();
    mainWindow.setTitle(APP_WINDOW_TITLE);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle(APP_WINDOW_TITLE);
  });
  setApplicationMenu();
}

function setApplicationMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder...', accelerator: 'Ctrl+O', click: () => mainWindow.webContents.send('menu-open-folder') },
        { label: 'Clear Playlist', click: () => mainWindow.webContents.send('menu-clear-playlist') },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'Ctrl+Q', role: 'quit' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About AFTC Music Player', click: () => mainWindow.webContents.send('menu-about') },
        { label: 'Keyboard Shortcuts', click: () => mainWindow.webContents.send('menu-shortcuts') }
        ,
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    }
  ]);

  Menu.setApplicationMenu(menu);
}

async function validatePlaylist(playlist) {
  const checks = playlist.map(async (track) => {
    try {
      if (!track?.path || isProtectedPath(track.path)) {
        return null;
      }

      await fs.access(track.path);
      return track;
    } catch {
      return null;
    }
  });

  const resolved = await Promise.all(checks);
  return resolved.filter(Boolean);
}

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const folder = result.filePaths[0];
  if (isProtectedPath(folder)) {
    return {
      canceled: false,
      files: [],
      failures: [{ filePath: folder, reason: 'Blocked protected folder.' }],
      source: folder
    };
  }

  const scanResult = await scanFolderRecursive(folder);
  return { canceled: false, ...scanResult, source: folder };
});

ipcMain.handle('import-dropped-paths', async (_event, rawPaths) => {
  const { valid, rejected } = sanitizeAndValidatePaths(rawPaths);
  const result = await collectFromMixedPaths(valid);

  const mappedRejected = rejected.map((reason) => ({ filePath: '', reason }));
  return {
    files: result.files,
    failures: [...mappedRejected, ...result.failures]
  };
});

ipcMain.handle('get-metadata-batch', async (_event, filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return {};
  }

  const map = await readMetadataBatch(filePaths, 4);
  return Object.fromEntries(map.entries());
});

ipcMain.handle('get-app-config', async () => {
  return loadAppConfig();
});

ipcMain.handle('get-saved-volume', () => {
  return store.get('volume', 75);
});

ipcMain.handle('save-volume', (_event, volume) => {
  if (typeof volume === 'number' && volume >= 0 && volume <= 100) {
    store.set('volume', Math.round(volume));
  }
});

ipcMain.handle('get-saved-playlist', async () => {
  const saved = store.get('playlist', []);
  const valid = await validatePlaylist(saved);
  if (valid.length !== saved.length) {
    store.set('playlist', valid);
  }

  const lastTrackPath = store.get('lastTrackPath');
  if (typeof lastTrackPath === 'string' && !valid.some((track) => track.path === lastTrackPath)) {
    store.delete('lastTrackPath');
  }

  return valid;
});

ipcMain.handle('save-playlist', (_event, playlist) => {
  if (Array.isArray(playlist)) {
    store.set('playlist', playlist);

    const lastTrackPath = store.get('lastTrackPath');
    if (typeof lastTrackPath === 'string' && !playlist.some((track) => track?.path === lastTrackPath)) {
      store.delete('lastTrackPath');
    }
  }
});

ipcMain.handle('get-last-track-path', async () => {
  const trackPath = store.get('lastTrackPath');
  if (typeof trackPath !== 'string' || !trackPath) {
    return null;
  }

  if (isProtectedPath(trackPath)) {
    store.delete('lastTrackPath');
    return null;
  }

  try {
    await fs.access(trackPath);
    return trackPath;
  } catch {
    store.delete('lastTrackPath');
    return null;
  }
});

ipcMain.handle('save-last-track-path', (_event, trackPath) => {
  if (typeof trackPath !== 'string' || !trackPath || isProtectedPath(trackPath)) {
    return;
  }

  store.set('lastTrackPath', trackPath);
});

ipcMain.handle('clear-last-track-path', () => {
  store.delete('lastTrackPath');
});

ipcMain.handle('remove-track', async (_event, trackPath) => {
  if (!trackPath || typeof trackPath !== 'string') {
    return { ok: false, error: 'Invalid track path.' };
  }

  const playlist = store.get('playlist', []);
  const next = playlist.filter((t) => t.path !== trackPath);
  store.set('playlist', next);

  if (store.get('lastTrackPath') === trackPath) {
    store.delete('lastTrackPath');
  }

  return { ok: true };
});

ipcMain.handle('delete-track-file', async (_event, trackPath) => {
  try {
    if (!trackPath || typeof trackPath !== 'string') {
      return { ok: false, error: 'Invalid track path.' };
    }

    await moveTrackToTrash(trackPath);
    const playlist = store.get('playlist', []);
    const next = playlist.filter((t) => t.path !== trackPath);
    store.set('playlist', next);

    if (store.get('lastTrackPath') === trackPath) {
      store.delete('lastTrackPath');
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('set-track-rating', async (_event, payload) => {
  try {
    const trackPath = payload?.trackPath;
    const rating = payload?.rating;

    if (!trackPath || typeof trackPath !== 'string') {
      return { ok: false, error: 'Invalid track path.' };
    }

    if (isProtectedPath(trackPath)) {
      return { ok: false, error: 'Blocked protected path.' };
    }

    await writeTrackRating(trackPath, rating);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || 'Failed to write track rating.' };
  }
});

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    restoreAndFocusMainWindow();
  });

  app.whenReady().then(() => {
    createWindow();
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    return;
  }

  restoreAndFocusMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  destroyTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
