import { app, Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';

let tray = null;

function getTrayImage() {
  const pngPath = path.join(app.getAppPath(), 'src', 'assets', 'icons', 'tray-icon.png');
  const image = nativeImage.createFromPath(pngPath);

  if (!image.isEmpty()) {
    return image.resize({ width: 16, height: 16 });
  }

  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAKElEQVR4AWP4//8/AzUYTFhMUAxEMRjFYBRjQv///xkQxWAMQ0EAAHi3CF7XTur2AAAAAElFTkSuQmCC'
  );
}

export function ensureTray(mainWindow) {
  if (tray) {
    return tray;
  }

  tray = new Tray(getTrayImage());
  tray.setToolTip('AFTC Music Player');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Stop',
      click: () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('tray-control', 'stop');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
