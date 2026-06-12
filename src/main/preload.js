const { contextBridge, ipcRenderer } = require('electron');

const api = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => ipcRenderer.on(channel, (event, ...args) => listener(event, ...args)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args)
};

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('electron', { 
  ipcRenderer: api,
  getHWID: () => ipcRenderer.invoke('license-get-hwid'),
  revalidate: () => ipcRenderer.invoke('license-revalidate'),
  onLicenseOk: (cb) => ipcRenderer.on('license-ok', (event, data) => cb(data)),
  onLicenseReq: (cb) => ipcRenderer.on('license-required', (event, data) => cb(data)),
});
