# Paseo Buddy

A lightweight floating desktop companion for monitoring active Paseo agents.

> Status: project scaffold and architecture specification. The desktop overlay and live integration are not implemented yet.

## Vision

A small, always-on-top macOS pill inspired by the ChatGPT desktop launcher. It displays the number of actively running Paseo agents; clicking it opens a compact list of agents with workspace, status, and elapsed time.

## V1 scope

- Frameless, transparent, draggable, always-on-top desktop pill
- Live count of actively executing agent turns
- Popover listing running agents, with workspace and elapsed time
- Distinct state for agents waiting for permission
- Notifications on completion or failure
- Restore state after reconnect/restart
- Open a Paseo conversation from the popover, subject to confirming a supported deep-link API

## Architecture

The Paseo plugin executes inside a daemon subprocess. A separate desktop process is required for an operating-system-level floating window. The two communicate through an authenticated loopback channel.

See [architecture](docs/architecture.md), [requirements](docs/requirements.md), and [development guide](docs/development.md).

## Repository layout

```text
paseo-plugin.json          Paseo plugin manifest
index.server.ts            Daemon-side plugin entry
server/                    Daemon-only event handling
shared/                    Common state contracts
apps/desktop/              Planned Electron desktop app
docs/                      Architecture and development notes
```

## Install (after implementation)

Paseo supports installing directly from Git:

```sh
paseo plugin add git:jiangliuhong/paseo-buddy
```

Do not install this scaffold expecting a working desktop companion. The current plugin entry is intentionally a no-op until the event bridge is implemented.

## Development

See [docs/development.md](docs/development.md). Before implementing the runtime integration, generate a reference plugin with `paseo plugin init` and validate event payload types against the installed Paseo SDK.

## License

MIT.
