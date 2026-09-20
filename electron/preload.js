const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  fullscreenWindow: () => ipcRenderer.send('window-fullscreen'),
  closeWindow: () => ipcRenderer.send('window-close'),
  selectGGUFFile: () => ipcRenderer.invoke('dialog-select-gguf'),
  getPlatform: () => process.platform,
  getApiToken: () => ipcRenderer.invoke('get-api-token'),
  onBackendStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('backend-status', handler);
    return () => ipcRenderer.removeListener('backend-status', handler);
  }
});
