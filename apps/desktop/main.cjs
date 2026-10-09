const { app, BrowserWindow, ipcMain, screen, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
let win;
const compact = { width: 190, height: 64 };
const expanded = { width: 360, height: 380 };
const positionFile = () => path.join(app.getPath("userData"), "window-position.json");

function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function boundsFor(size, x, y) {
  const display = screen.getDisplayNearestPoint({ x, y }).workArea;
  return { width: size.width, height: size.height,
    x: clamp(x, display.x, display.x + Math.max(0, display.width - size.width)),
    y: clamp(y, display.y, display.y + Math.max(0, display.height - size.height)) };
}
function readPosition() {
  try {
    const pos = JSON.parse(fs.readFileSync(positionFile(), "utf8"));
    if (Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
  } catch {}
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - compact.width - 30, y: area.y + 30 };
}
function savePosition() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  try { fs.writeFileSync(positionFile(), JSON.stringify({ x, y })); } catch (error) {
    console.warn("Could not save window position:", error);
  }
}
function createWindow() {
  const position = readPosition();
  win = new BrowserWindow({
    ...boundsFor(compact, position.x, position.y),
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, hasShadow: false, backgroundColor: "#00000000",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: path.join(__dirname, "preload.cjs") }
  });
  win.setAlwaysOnTop(true, "floating");
  win.on("moved", savePosition);
  win.loadFile(path.join(__dirname, "dist/index.html"));
}
app.whenReady().then(() => {
  // macOS menu provides a reliable Quit action even with a taskbar-hidden window.
  const menu = Menu.buildFromTemplate([
    { label: "Paseo Buddy", submenu: [
      { role: "about" }, { type: "separator" },
      { label: "Show Window", click: () => win?.show() },
      { role: "quit" }
    ] },
    { label: "Edit", submenu: [{ role: "copy" }, { role: "paste" }] }
  ]);
  Menu.setApplicationMenu(menu);
  ipcMain.on("buddy:expand", (event, value) => {
    if (!win || event.sender !== win.webContents) return;
    const target = value ? expanded : compact;
    const current = win.getBounds();
    // Anchor to the right edge when resizing; clamp within the nearest display.
    const desiredX = current.x + current.width - target.width;
    win.setBounds(boundsFor(target, desiredX, current.y));
  });
  createWindow();
});
app.on("window-all-closed", () => app.quit());
