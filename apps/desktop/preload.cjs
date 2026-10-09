const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("buddy", {
  expand: (expanded) => ipcRenderer.invoke("buddy:expand", Boolean(expanded)),
});
