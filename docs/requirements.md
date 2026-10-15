# Paseo Buddy — V1 requirements

## Product

A lightweight macOS floating pill inspired by the ChatGPT desktop launcher. The pill is always on top and can be dragged. The right side shows the number of actively running Paseo agent turns. Clicking it toggles a popover with agent details.

## Functional requirements

1. Show a floating, transparent, frameless pill without taking focus unnecessarily.
2. Count currently executing agent turns (not all created agents).
3. Show running agent list with workspace, agent name, status, and elapsed time.
4. Show permission-blocked agents separately from actively executing turns.
5. Update the count and list on lifecycle events.
6. Notify once per completed/failed turn; do not notify on initial state hydration.
7. Recover accurate state after startup, reconnect, plugin reload, and daemon restart.
8. Open the selected conversation in Paseo when a supported route is available.
9. Preserve overlay position; support a compact collapsed state and dragging to the full physical screen edges, including the area reserved for the Dock. Expanded content must not cover the pill.
10. Never expose a bridge on a public network interface.
11. Display completed-unread agents in green until Paseo marks them read, separately from red running counts. Opening Buddy must not automatically mark them read. An explicit per-card Mark as read action must synchronize to Paseo and wait for authoritative state updates before removing the card.
12. Enabling the plugin on local macOS starts only a verified current-version companion cache; first installation uses a single explicit download-and-start settings action for a fixed matching GitHub Release; disabling it cancels downloads and closes its owned process.
13. Expose opacity, size, icon visibility, text visibility, custom single-line text and adaptive list height bounds under Paseo plugin settings. Persist them per installation and apply saved changes live without losing the floating pill position. Zero running/unread counts hide their badges; hidden content must not reserve blank space. Keep the pill clickable when all content is hidden.
14. Native release builds use bundled Swift/AppKit source and Apple tools in CI. Users download bounded, SHA-256-verified release executables without installing developer tools. Preserve legacy Electron caches and invalid/unknown native caches for explicit cleanup.

15. Aggregate agents from configured Paseo hosts through the desktop client’s borrowed APIs, with host labels, independent recovery and host-scoped conversation/notification identity. Preserve local observation when the client relay disappears; discard stale remote state after 15 seconds. Remote read controls remain unavailable until a supported API exists.
16. Opening or dismissing the pill context menu must preserve the pill anchor in collapsed and expanded modes.

## Acceptance scenarios

- Start three concurrent turns: show 3.
- End one turn: show 2.
- Request permission: mark waiting and adjust running count per documented semantics.
- Reconnect mid-turn: reconcile with authoritative daemon snapshot.
- Repeat an event: no duplicate completion notification.
- Two hosts return the same agent/turn ID: show both agents and notify independently.
- One remote host disconnects: clear only its agents and show its connection status.
- Close the Paseo client: expire remote state within 15 seconds and retain local observation.
- Open/dismiss the context menu on a collapsed/expanded pill: preserve its anchor.
- Quit desktop process: daemon plugin remains stable.
- Restart daemon: desktop process reconnects and refreshes state.

## Out of scope

Animated pet, task execution controls, cloud sync, Windows/Linux packaging, and arbitrary agent commands.

## Verified integration and limits

Integrations were checked against installed Paseo 0.11.2 and official plugin/client/protocol declarations at 0.11.1. The implementation uses owned directory snapshots, explicit terminal events and turn IDs, directory project/workspace metadata, the official agent deep-link builder, and a locally compiled AppKit child with fixed process arguments. It does not infer terminal events from idle status or invent routing fields.

## Native migration

The current implementation uses a Swift/AppKit accessory panel, replacing Electron. macOS 13+ is required. A user click downloads the version/architecture/source-matched native release; no compiler is required on user machines. Source resides in the server bundle for identity verification and developer builds. A Node SDK observer sends normalized state over stdin, without credentials. Completion/failure notifications are implemented for live SDK terminal events carrying explicit turn IDs, when macOS notification authorization has already been granted. Initial/reconnect snapshots never notify. Events missed before timeline subscription or during disconnection are not backfilled; events without a turn ID are skipped. Actual system banner delivery still needs manual acceptance. Conversation navigation is implemented through the official agent deep-link helper when the local daemon identity is available; routing to this project’s conversation has been verified locally, with broader hardware/accessibility scenarios still pending.
