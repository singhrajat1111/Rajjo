const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  selectGGUFFile: () => ipcRenderer.invoke('dialog-select-gguf'),
  getPlatform: () => process.platform,
  onBackendStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('backend-status', handler);
    return () => ipcRenderer.removeListener('backend-status', handler);
  }
});
