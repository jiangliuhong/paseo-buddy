const { app, BrowserWindow, ipcMain, screen, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { compact, boundsFor, collapsedAnchor, resizedBounds } = require("./window-bounds.cjs");

let win;
let positionTimer;
const positionFile = () => path.join(app.getPath("userData"), "window-position.json");

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
  const anchor = collapsedAnchor(win.getBounds());
  try {
    fs.mkdirSync(path.dirname(positionFile()), { recursive: true });
    fs.writeFileSync(positionFile(), JSON.stringify(anchor));
  } catch (error) {
    console.warn("Could not save window position:", error);
  }
}

function scheduleSavePosition() {
  clearTimeout(positionTimer);
  positionTimer = setTimeout(savePosition, 200);
}

function createWindow() {
  const pos = readPosition();
  const area = screen.getDisplayNearestPoint(pos).workArea;
  win = new BrowserWindow({
    ...boundsFor(compact, pos.x, pos.y, area),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.setAlwaysOnTop(true, "floating");
  win.on("moved", scheduleSavePosition);
  win.on("close", () => {
    clearTimeout(positionTimer);
    savePosition();
  });

  // Provide a Quit action even when there is no Dock/taskbar entry.
  win.webContents.on("context-menu", () => {
    Menu.buildFromTemplate([
      { label: "Show Paseo Buddy", click: () => win?.show() },
      { type: "separator" },
      { label: "Quit Paseo Buddy", role: "quit" },
    ]).popup({ window: win });
  });

  // Desktop mock has no reason to navigate to external URLs.
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.loadFile(path.join(__dirname, "dist/index.html"));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Paseo Buddy", submenu: [
      { role: "about" },
      { type: "separator" },
      { label: "Show Window", click: () => win?.show() },
      { role: "quit" },
    ] },
    { label: "Edit", submenu: [{ role: "copy" }, { role: "paste" }] },
  ]));

  ipcMain.on("buddy:expand", (event, value) => {
    if (!win || win.isDestroyed() || event.sender !== win.webContents
        || event.senderFrame !== win.webContents.mainFrame) return;

    const current = win.getBounds();
    const area = screen.getDisplayNearestPoint({
      x: current.x + current.width - 1,
      y: current.y,
    }).workArea;
    win.setBounds(resizedBounds(current, value === true, area));
  });

  createWindow();
});

app.on("window-all-closed", () => app.quit());
