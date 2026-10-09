# Architecture

## Components

1. **Paseo daemon plugin** (`index.server.ts`, `server/`): subscribes to agent lifecycle events and builds a normalized state snapshot.
2. **Local bridge** (planned): authenticated loopback WebSocket or IPC endpoint for snapshot + incremental updates. Bind to 127.0.0.1 only. Use per-session secret, validate origin, and never log secrets.
3. **Desktop app** (`apps/desktop/`, planned): Electron main process manages transparent always-on-top window, notification permissions, process lifecycle, and safe external navigation. React renderer draws pill and popover.
4. **Shared contracts** (`shared/`): typed AgentStatus, AgentSnapshot, and event envelopes.

## State model

- `running`: an active executing turn
- `waiting_permission`: blocked awaiting user confirmation
- `idle`: no executing turn
- `completed` / `failed` / `cancelled`: terminal turn outcomes

Agent identity and turn identity are distinct. Completion notifications are deduplicated by daemon identity + agent ID + turn ID. Initial hydration never produces completion notifications.

## Synchronization

On connection: authenticate, request snapshot, then apply versioned events. On disconnect: show disconnected state and reconnect with backoff. On reconnect: replace local state with a fresh authoritative snapshot. Handle stale/duplicate events and daemon restarts explicitly.

## Security

Paseo plugins are trusted code running with daemon user privileges. Desktop bridge must not provide arbitrary command execution. Use loopback binding, a session token, input validation, and narrow message schemas. Electron renderer must use context isolation, sandboxing, and disabled Node integration.

## Packaging

The repository root is a valid Paseo plugin source. Desktop app is packaged separately initially. Plugin-driven auto-start is a later feature, conditional on verified Paseo lifecycle support and user consent.

## Implementation milestones

1. Verify plugin SDK types and build a lifecycle adapter with tests.
2. Implement authenticated bridge and snapshot reconciliation.
3. Build macOS pill/popover with mock state.
4. Integrate live state and notifications.
5. Package, test, and document installation.
