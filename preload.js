import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  importDroppedPaths: (paths) => ipcRenderer.invoke('import-dropped-paths', paths),
  getSavedVolume: () => ipcRenderer.invoke('get-saved-volume'),
  saveVolume: (volume) => ipcRenderer.invoke('save-volume', volume),
  getSavedPlaylist: () => ipcRenderer.invoke('get-saved-playlist'),
  savePlaylist: (playlist) => ipcRenderer.invoke('save-playlist', playlist),
  getLastTrackPath: () => ipcRenderer.invoke('get-last-track-path'),
  saveLastTrackPath: (trackPath) => ipcRenderer.invoke('save-last-track-path', trackPath),
  clearLastTrackPath: () => ipcRenderer.invoke('clear-last-track-path'),
  getMetadataBatch: (filePaths) => ipcRenderer.invoke('get-metadata-batch', filePaths),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  setTrackRating: (trackPath, rating) => ipcRenderer.invoke('set-track-rating', { trackPath, rating }),
  removeTrack: (trackPath) => ipcRenderer.invoke('remove-track', trackPath),
  deleteTrackFile: (trackPath) => ipcRenderer.invoke('delete-track-file', trackPath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onMenuOpenFolder: (handler) => subscribe('menu-open-folder', handler),
  onMenuClearPlaylist: (handler) => subscribe('menu-clear-playlist', handler),
  onMenuAbout: (handler) => subscribe('menu-about', handler),
  onMenuShortcuts: (handler) => subscribe('menu-shortcuts', handler),
  onTrayControl: (handler) => subscribe('tray-control', handler)
};

function subscribe(channel, handler) {
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('aftc', api);
