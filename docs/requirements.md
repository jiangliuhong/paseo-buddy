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
9. Preserve overlay position; support a compact collapsed state.
10. Never expose a bridge on a public network interface.
11. Display completed-unread agents in green until Paseo marks them read, separately from red running counts. Opening Buddy must not mark them read.

## Acceptance scenarios

- Start three concurrent turns: show 3.
- End one turn: show 2.
- Request permission: mark waiting and adjust running count per documented semantics.
- Reconnect mid-turn: reconcile with authoritative daemon snapshot.
- Repeat an event: no duplicate completion notification.
- Quit desktop process: daemon plugin remains stable.
- Restart daemon: desktop process reconnects and refreshes state.

## Out of scope

Animated pet, task execution controls, cloud sync, Windows/Linux packaging, cross-host aggregation, and arbitrary agent commands.

## Open integration questions

Confirm lifecycle event payloads, SDK snapshot/query API, stable agent IDs, workspace metadata, deep-link routing, and safe desktop process launching against the exact installed Paseo version before implementing these features.
