# Paseo Buddy

A lightweight floating desktop companion for monitoring Paseo agents.

> Status: Electron floating-pill **UI prototype** available with three sample agents. The Paseo daemon plugin entry is currently a no-op. **No live Agent data, notifications, or conversation navigation yet.**

## Preview the desktop pill (macOS)

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

Drag the robot side of the pill to move it, click the running count to expand/collapse the example agent list, and right-click the window to quit. See [desktop instructions](apps/desktop/README.md).

## V1 target

- Frameless, transparent, draggable, always-on-top desktop pill
- Live count of actively executing Paseo turns
- Popover listing running agents by workspace and duration
- Separate display for permission-blocked agents
- Notifications on completion or failure
- Recovery after reconnect/restart
- Open a Paseo conversation from the popover where routing is supported

## Architecture

The Paseo plugin executes inside a daemon subprocess. The standalone Electron process owns the native floating window. A future authenticated loopback transport will keep them in sync.

See [architecture](docs/architecture.md), [requirements](docs/requirements.md), and [development guide](docs/development.md).

## Repository

```text
package.json                  npm workspaces: root + apps/desktop
paseo-plugin.json             Paseo plugin manifest
index.server.ts               No-op daemon plugin entry
apps/desktop/                 Runnable Electron/React UI demo
apps/desktop/window-bounds.cjs  Pure window geometry
apps/desktop/tests/           Geometry regression tests
.github/workflows/            Desktop static checks
docs/                         Architecture and requirements
```

## Paseo integration (planned)

Paseo can install directly from Git:

```sh
paseo plugin add git:jiangliuhong/paseo-buddy
```

Do **not** install the plugin expecting a working companion yet; the server entry deliberately registers no handlers.

## Development

Run `npm run check` from the repository root to test UI geometry and compile the renderer. Actual macOS GUI behavior still requires a manual smoke test.

## License

MIT.
