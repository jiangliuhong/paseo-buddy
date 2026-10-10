# Paseo Buddy

A lightweight floating desktop companion for monitoring Paseo agents.

> Status: The Electron pill reads live local Paseo agent snapshots and updates through the official SDK. Running counts, completed-unread counts, permission waits, elapsed time, and reconnect are implemented. Completion notifications and conversation navigation are still planned.

## Download the macOS preview

[GitHub Releases](https://github.com/jiangliuhong/paseo-buddy/releases) provides Apple Silicon (`arm64`) and Intel (`x64`) DMG/ZIP packages. Start Paseo >=0.11.1 first, then launch Paseo Buddy. The app does not require Node.js or npm. The first release is an unsigned, unnotarized preview; see the release notes for first-launch instructions.

## Run from source (macOS)

Node.js 22+ and npm are required. Install dependencies **from the repository root** so npm installs the desktop workspace and its React/Vite/TypeScript type packages.

```sh
git clone https://github.com/jiangliuhong/paseo-buddy.git
cd paseo-buddy
npm install
npm run check
npm run electron:start
```

You can also run `npm run electron:start` within `apps/desktop` after the root install.

> If you previously installed dependencies before the workspace configuration was added, run `git pull` and `npm install` **at the repository root** again. A root-only install of an older revision does not install desktop development dependencies.

If startup reports missing React declarations (`TS7016`) or missing `react-dom/client`, `lucide-react`, or Vite (`TS2307`), run `npm install --include=dev` from the repository root, then retry `npm run electron:start`. The desktop build requires development dependencies even when `NODE_ENV=production` or npm is configured to omit them.

The compact 88 × 36 px pill stays out of the macOS Dock and appears without taking focus. Drag anywhere on the pill to move it, click anywhere to expand/collapse the live agent list, and right-click the window to quit. Running counts turn red while positive; completed-unread counts appear in green and clear when the agent is read in Paseo; the pill can be dragged to the screen bottom and opens its list upward there. Truncated names show a full-text preview after 120ms of hover, or immediately on keyboard focus. See [desktop instructions](apps/desktop/README.md).

## V1 target

- Frameless, transparent, draggable, always-on-top desktop pill
- Live count of actively executing Paseo turns
- Popover listing project name, workspace name, agent name, and duration
- Separate display for permission-blocked agents
- Notifications on completion or failure
- Recovery after reconnect/restart
- Open a Paseo conversation from the popover where routing is supported

## Architecture

The Paseo plugin runs inside a daemon subprocess and exposes a read-only `agents.snapshot` RPC. The standalone Electron main process subscribes directly to the local daemon using `@getpaseo/client` and sends normalized state to its sandboxed renderer over IPC. No additional bridge port is opened.

Start Paseo first. Buddy discovers its loopback endpoint from `~/.paseo/paseo.pid` and reads the existing `local-credential` only in the main process. Set `PASEO_HOME` for a different local daemon home, for example `PASEO_HOME=/path/to/home npm run electron:start`. The endpoint and credential are re-read after disconnects; Buddy never copies or persists the credential.

See [architecture](docs/architecture.md), [requirements](docs/requirements.md), and [development guide](docs/development.md).

## Repository

```text
package.json                  npm workspaces: root + apps/desktop
paseo-plugin.json             Paseo plugin manifest
index.server.ts               Read-only agent snapshot RPC
apps/desktop/                 Live Electron/React overlay
apps/desktop/window-bounds.cjs  Pure window geometry
server/                       Agent normalization and SDK observation
shared/                       Agent contracts and snapshot RPC schema
tests/                        State and reconnect regression tests
apps/desktop/tests/           Geometry and local connection tests
.github/workflows/            Desktop static checks
docs/                         Architecture and requirements
```

## Paseo integration

Paseo can install directly from Git:

```sh
paseo plugin add git:jiangliuhong/paseo-buddy
```

The plugin requires Paseo >=0.11.1. SDK declarations were checked against `@getpaseo/plugin` and `@getpaseo/client` 0.11.1; a read-only live subscription was verified against local Paseo 0.11.2. Enable plugins manually in Paseo Settings if using the snapshot RPC. The standalone desktop monitor works without installing or enabling the plugin and must be launched separately.

## Development

Run `npm run check` from the repository root to typecheck the plugin, test agent state/reconnect and UI geometry, and compile the runtime and renderer. Actual macOS GUI behavior still requires a manual smoke test.

## License

MIT.

See [release instructions](docs/releasing.md) for building packages and the GitHub Release workflow.
