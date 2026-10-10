# Architecture

## Components

1. **Paseo daemon plugin** (`index.server.ts`, `server/`): exposes the read-only `agents.snapshot` RPC through the daemon-scoped SDK and owns desktop companion download/start/stop. The RPC follows page cursors and normalizes executing agents.
2. **Desktop observation adapter** (`server/live-agents.ts`): Node-only public SDK subscription, running in the trusted Electron main process. It consumes snapshot and `agent_update` messages, clears state on disconnect, and reconnects with fresh endpoint/credential discovery.
3. **Desktop app** (`apps/desktop/`): Electron owns the floating window and local daemon credential. Sandboxed React renderer receives normalized state via narrow IPC; it draws the live count and separate permission-wait list.
4. **Shared contracts** (`shared/`): normalized running/waiting agent fields, connection state, and typed snapshot RPC.

The desktop reads the daemon directly. There is no extra bridge listener or token discovery file. The plugin RPC provides the same normalization for Paseo-hosted callers; standalone desktop observation does not require plugin activation.

## State model

The daemon SDK statuses are `initializing`, `running`, `idle`, `error`, and `closed`. Buddy includes unarchived agents whose daemon status is `running`; pending permissions normalize to `waiting_permission` and are excluded from the running count. It also includes `idle`/`closed` agents with daemon `requiresAttention === true`, `attentionReason === "finished"`, and no pending permissions as `completed_unread`. The pill shows these in green, alongside red running counts when both exist. Read operations in Paseo clear attention and automatically remove the green count; Buddy never sends a read/clear-attention action. Directory observation includes all unarchived statuses so completed agents and read updates remain visible. Active turn identity and timestamp come only from `activeTurn`. Each row displays `${projectName} - ${workspaceName}` from the directory entry’s daemon-provided `project` placement, followed by agent `title` with provider fallback. Status-only updates preserve placement metadata for the same workspace; fresh snapshots and explicit null metadata replace it. Missing project metadata falls back to the basename of `cwd`, and missing workspace name displays `—`.

Completion notifications remain planned. A future implementation must use verified terminal events rather than infer completion from an idle transition, suppress hydration notifications, and deduplicate by daemon + agent + turn identity.

## Synchronization

The SDK owned directory subscription supplies the initial snapshot before buffered updates. Replace the local map on snapshots; apply idempotent upserts/removals afterward. On connection loss, clear agents and display disconnected state. Recreate the client with exponential backoff (1–30 seconds), re-reading daemon endpoint/credential, and hydrate from a new authoritative snapshot. Reject truncated subscription snapshots to avoid a misleading partial count.

## Security

The main process accepts only explicit loopback TCP endpoints from the selected Paseo home's PID file. Its existing local credential stays in memory, is never sent over renderer IPC, and is never copied into Buddy storage or logs. No extra listening port, arbitrary command surface, or daemon settings modification is introduced. Electron uses context isolation, sandboxing, disabled Node integration, and main-frame sender validation for IPC.

## Packaging

The repository root is a valid Paseo plugin source. The desktop app is packaged separately as macOS DMG/ZIP downloads. Its renderer and bundled SDK adapter are staged under `build/desktop`; packaged main-process imports remain inside the application. Plugin enable starts the companion on local macOS; async plugin cleanup aborts pending downloads and terminates only its own child. The child also exits when its parent disappears. The app’s single-instance lock prevents duplicate current-version windows.

## Remaining V1 work

- Completion/failure notifications with verified lifecycle identities and deduplication
- Supported conversation navigation
- Real daemon restart/permission/turn-transition acceptance tests
- Apple Developer signing/notarization and additional native window acceptance tests

## Companion acquisition and lifecycle

`server/desktop-companion.ts` selects only the fixed version’s arm64/x64 ZIP under the project’s GitHub Releases. It obtains SHA-256 from that release’s checksum manifest, verifies bytes before extraction, validates bundle ID and code signature, and installs atomically into `~/Library/Caches/Paseo Buddy/companions`. It invokes only `/usr/bin/ditto`, `/usr/bin/plutil`, `/usr/bin/codesign`, and the verified app executable, without a shell or user-supplied commands. No administrator privileges, OS security bypass, or credential copying are used. A narrow environment carries local daemon home and parent identity while excluding provider secrets.

Startup runs in the background without blocking RPC registration. Downloads retry with backoff, are cancellable on plugin unload, and never launch partial/unverified files. Cached apps are validated before reuse. Only a local macOS desktop session can display the app; remote daemons do not launch client-side windows.
