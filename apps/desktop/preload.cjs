const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('buddy', { expand: (expanded) => ipcRenderer.send('buddy:expand', Boolean(expanded)) });
