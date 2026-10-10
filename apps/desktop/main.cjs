const { app, BrowserWindow, ipcMain, screen, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { compact, defaultPlacement, boundsFor, collapsedAnchor, resizedLayout } = require("./window-bounds.cjs");

const { readPaseoConfig } = require("./paseo-connection.cjs");
const { createGesture } = require("./window-drag.cjs");
let gesture;
let dragTimer;
let isExpanded = false;
let liveAgents;
let agentState = { connection: "connecting", agents: [] };
let win;
let positionTimer;
let placement = defaultPlacement;
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
  const anchor = collapsedAnchor(win.getBounds(), placement);
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
  const area = screen.getDisplayNearestPoint(pos).bounds;
  win = new BrowserWindow({
    ...boundsFor(compact, pos.x, pos.y, area),
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    // Disable AppKit work-area clamping; our geometry keeps the window on screen.
    enableLargerThanScreen: true,
    acceptFirstMouse: true,
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

  win.setAlwaysOnTop(true, "pop-up-menu");
  win.once("ready-to-show", () => win.showInactive());
  win.on("moved", scheduleSavePosition);
  win.on("close", () => {
    clearTimeout(positionTimer);
    clearInterval(dragTimer);
    gesture = undefined;
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

  // The monitoring UI has no reason to navigate to external URLs.
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.loadFile(path.join(__dirname, "dist/index.html"));
}

app.whenReady().then(() => {
  // skipTaskbar alone does not hide the macOS application icon.
  if (process.platform === "darwin") app.dock?.hide();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Paseo Buddy", submenu: [
      { role: "about" },
      { type: "separator" },
      { label: "Show Window", click: () => win?.show() },
      { role: "quit" },
    ] },
    { label: "Edit", submenu: [{ role: "copy" }, { role: "paste" }] },
  ]));

  const validateSender = (event) => {
    if (!win || win.isDestroyed() || event.sender !== win.webContents
        || event.senderFrame !== win.webContents.mainFrame) throw new Error("Invalid IPC sender");
  };
  const moveGesture = () => {
    if (!gesture || !win || win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).bounds;
    const layout = gesture.move(cursor, area, isExpanded);
    if (!layout) return;
    const changed = placement.horizontal !== layout.placement.horizontal
      || placement.vertical !== layout.placement.vertical;
    placement = layout.placement;
    win.setBounds(layout.bounds);
    if (changed) win.webContents.send("buddy:placement", placement);
  };
  ipcMain.handle("buddy:drag-start", (event) => {
    validateSender(event);
    clearInterval(dragTimer);
    gesture = createGesture(screen.getCursorScreenPoint(), collapsedAnchor(win.getBounds(), placement));
    dragTimer = setInterval(moveGesture, 16);
  });
  ipcMain.handle("buddy:drag-end", (event) => {
    validateSender(event);
    moveGesture();
    const dragged = gesture?.dragged ?? false;
    clearInterval(dragTimer);
    gesture = undefined;
    if (dragged) scheduleSavePosition();
    return { dragged };
  });

  ipcMain.handle("buddy:expand", (event, value) => {
    if (!win || win.isDestroyed() || event.sender !== win.webContents
        || event.senderFrame !== win.webContents.mainFrame) {
      throw new Error("Invalid IPC sender");
    }

    const current = win.getBounds();
    const area = screen.getDisplayNearestPoint({
      x: current.x + current.width - 1,
      y: current.y,
    }).bounds;
    isExpanded = value === true;
    const layout = resizedLayout(current, isExpanded, area, placement);
    placement = layout.placement;
    win.setBounds(layout.bounds);
    return { placement };
  });

  ipcMain.handle("buddy:agents", (event) => {
    if (!win || event.sender !== win.webContents
        || event.senderFrame !== win.webContents.mainFrame) throw new Error("Invalid IPC sender");
    return agentState;
  });
  createWindow();
  const runtime = app.isPackaged
    ? pathToFileURL(path.join(__dirname, "runtime/live-agents.mjs")).href
    : pathToFileURL(path.join(__dirname, "../../build/server/live-agents.js")).href;
  import(runtime).then(({ startLiveAgents }) => {
    liveAgents = startLiveAgents({
      config: readPaseoConfig,
      publish(state) {
        agentState = state;
        if (win && !win.isDestroyed()) win.webContents.send("buddy:agents-changed", state);
      },
    });
  }).catch(() => {
    agentState = { connection: "disconnected", agents: [] };
    if (win && !win.isDestroyed()) win.webContents.send("buddy:agents-changed", agentState);
  });
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => { void liveAgents?.stop(); });
