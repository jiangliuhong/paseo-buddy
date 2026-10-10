const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("buddy", {
  beginDrag: () => ipcRenderer.invoke("buddy:drag-start"),
  endDrag: () => ipcRenderer.invoke("buddy:drag-end"),
  onPlacement: (callback) => {
    const listener = (_event, placement) => callback(placement);
    ipcRenderer.on("buddy:placement", listener);
    return () => ipcRenderer.removeListener("buddy:placement", listener);
  },
  getAgents: () => ipcRenderer.invoke("buddy:agents"),
  onAgents: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("buddy:agents-changed", listener);
    return () => ipcRenderer.removeListener("buddy:agents-changed", listener);
  },
  expand: (expanded) => ipcRenderer.invoke("buddy:expand", Boolean(expanded)),
});
