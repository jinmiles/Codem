const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codem', {
  getSnapshot: () => ipcRenderer.invoke('codem:get_snapshot'),
  refreshNow: () => ipcRenderer.invoke('codem:refresh_now'),
  onUsageUpdated: (handler) => {
    const listener = (_event, snapshot) => handler(snapshot);
    ipcRenderer.on('usage://updated', listener);
    return () => ipcRenderer.removeListener('usage://updated', listener);
  },
});
