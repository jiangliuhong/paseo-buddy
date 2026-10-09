const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
let win;
const compact = { width: 190, height: 64 };
const expanded = { width: 360, height: 380 };
function createWindow() {
  const display = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({ width: compact.width, height: compact.height, x: display.x + display.width - 220, y: display.y + 30, frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true, hasShadow: false, backgroundColor: '#00000000', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') } });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'dist/index.html'));
}
app.whenReady().then(() => { ipcMain.on('buddy:expand', (_event, value) => { if (!win) return; const next = value ? expanded : compact; const [x, y] = win.getPosition(); win.setBounds({ x: Math.max(0, x + (compact.width - next.width)), y, ...next }); }); createWindow(); });
app.on('window-all-closed', () => app.quit());
