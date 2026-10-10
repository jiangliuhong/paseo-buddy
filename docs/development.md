# Development

## Prerequisites

- Node.js 22+ and npm
- Paseo CLI and daemon
- macOS for desktop overlay development

## Plugin and desktop development

```sh
git clone https://github.com/jiangliuhong/paseo-buddy.git
cd paseo-buddy
npm install
npm run typecheck
```

The plugin exposes a read-only `agents.snapshot` RPC using the daemon-scoped public SDK. On local macOS it also downloads and launches its lifecycle-owned companion. Source development can still launch the desktop separately with `npm run electron:start`.

## Verified integration

- Installed Paseo: 0.11.2; official plugin/client SDK declarations: 0.11.1.
- `agents.list({ filter: { includeArchived: false }, subscribe: {} })` supplies an authoritative directory and an owned subscription.
- Subscription callbacks deliver initial snapshots before buffered `agent_update` upserts/removals. Initial/reconnect snapshots replace the whole local map.
- Count only `status === "running"` agents with no pending permissions as running. Unarchived `idle`/`closed` agents with `requiresAttention === true`, `attentionReason === "finished"`, and no pending permissions count as completed unread. The full unarchived agent directory is observed so completion and subsequent read updates remain visible. Pending permissions are shown separately. Rows display `${projectName} - ${workspaceName}` from the agent directory’s `project` placement, followed by agent `title` with provider fallback; elapsed time uses `activeTurn.startedAt` (unknown time displays `—`).
- Main process reads the daemon endpoint and existing local credential from `PASEO_HOME` (default `~/.paseo`). Only explicit loopback TCP endpoints are supported. Unix sockets and public bind addresses are rejected.
- The public SDK's `authHeader` Bearer compatibility path was verified against the installed daemon. The credential stays in memory, never enters renderer IPC, and is re-read for each reconnect.
- Buddy recreates its SDK client after disconnects with backoff from 1 second to 30 seconds. Connection health is checked once per second. The disconnected UI clears stale agents and displays `—` for the count.
- Truncated subscription snapshots are rejected rather than showing a partial count. The plugin snapshot RPC follows all returned page cursors.
- Notifications, conversation navigation, Apple Developer signing, and notarization remain unimplemented.

Official SDK behavior: [subscriptions and reconnect](https://paseo.sh/docs/sdk/events).

```sh
npm run check          # plugin typecheck, state/reconnect/geometry tests, runtime + renderer build
npm run runtime:build  # compile server/shared modules for the desktop main process
npm run electron:start
# Select another local Paseo daemon home:
PASEO_HOME=/path/to/home npm run electron:start
```

A read-only smoke test with the completed adapter received real running agents, titles, and turn timestamps from the installed daemon. Automated reconnect tests use controlled SDK clients; no live daemon restart or live permission/turn mutation was performed. Native macOS window behavior still needs a GUI smoke test.

## Plugin installation

Enable plugins explicitly in Paseo Settings after reviewing trusted-code implications, then:

```sh
paseo plugin add git:jiangliuhong/paseo-buddy
paseo plugin ls
paseo plugin logs paseo-buddy
```

Never enable the global plugin switch automatically.

## Compact desktop window

The visible pill is 88 × 36 px inside a 104 × 52 px transparent window; the popover window is 320 × 340 px. Keep CSS dimensions and `window-bounds.cjs` geometry in sync. On macOS, `app.dock.hide()` hides the Dock icon, and the window opens with `showInactive()` after rendering. Quit from the pill’s right-click menu. A previous isolated macOS Electron smoke test verified `dock.isVisible() === false`, the compact/expanded window geometry; both rendered captures were visually reviewed.

The whole pill uses pointer capture and narrow drag-start/drag-end IPC. Main-process cursor sampling applies a 4px drag threshold; a drag never toggles the panel. Screen placement uses full display bounds and `enableLargerThanScreen` disables AppKit’s work-area clamping, so the pill can reach the actual screen bottom. The `pop-up-menu` window level keeps it visible above the Dock. The panel opens above a bottom-positioned pill and keeps its anchor while dragging. Positive running counts are red; completed-unread counts are green. Both appear together when needed, and zero/disconnected counts are neutral. Buddy never clears Paseo attention state.

An isolated macOS Electron gesture test verified clicks at both padding edges, the icon and the count; drag release did not open the panel. The actual window reached y=1100 with height=52 on a 1152px display (beyond its work area), and expanding there opened the panel above. The live count was red and only one pill icon was present.

## Desktop startup troubleshooting

`npm run electron:start` builds the desktop workspace before launching Electron. Errors such as `TS7016` for React or `TS2307` for `react-dom/client`, `lucide-react`, or Vite indicate missing workspace dependencies, including development packages.

From the repository root, run:

```sh
npm install --include=dev
npm ls react react-dom lucide-react vite @types/react @types/react-dom electron --workspace @paseo-buddy/desktop
npm run check
npm run electron:start
```

An install performed before the desktop workspace was added must be refreshed. `--include=dev` also includes the compiler and type packages when npm is configured to omit development dependencies. A successful build verifies compilation; confirm the floating window on macOS separately.

## Development rules

- Keep daemon-only Node code in `server/`.
- Keep cross-runtime types in `shared/`.
- Keep Electron-specific code in `apps/desktop/`.
- Do not claim a feature works until tested on a real daemon.
- Prefer event updates plus authoritative snapshots over polling alone.
- Keep the desktop renderer free of Node.js privileges.

Unread semantics were checked against the installed Paseo 0.11.2 attention projection and `clearAgentAttention` implementation: clearing attention persists the read state and emits an updated agent snapshot. State/reconnect tests cover initial unread hydration, completion, duplicate updates, read clearing, rerun, and archival.

Name previews use `src/name-tooltip.tsx` rather than native `title` delays. Only truncated names activate the preview (120ms hover, immediate keyboard focus). A body portal avoids clipping by the scrolling agent list; measured placement keeps the preview within the window, including when the panel opens above the pill.

An isolated Electron renderer check with stable fixture data verified hover previews within 170ms (120ms configured delay), exact full text, viewport bounds, immediate focused-label previews, and Escape/list-scroll dismissal.

Companion bootstrap tests inject downloads and child processes so `npm run check` never installs or launches software. `contribute()` returns async cleanup that stops the owned child. The default bootstrap uses the pinned release, cancellable streaming SHA-256 verification, macOS app validation, and fixed executable argv. A managed app receives only a narrow environment, and monitors `PASEO_BUDDY_PARENT_PID` to avoid an orphan after daemon/plugin crashes.

The v0.1.1 local native companion smoke test streamed and checksummed the built ZIP, extracted it with ditto, validated bundle ID/signature, opened a managed window connected to the real daemon, reused its cache without downloading again, confirmed a duplicate launch exited, and confirmed controller cleanup terminated its child. This test used a temporary cache and did not install a public Git plugin or modify Paseo trust settings.
