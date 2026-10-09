# Agent development rules

- This repository is Paseo Buddy, a macOS floating companion for Paseo agents.
- Prioritize V1: live running count, popover list, completion notification, reliable reconnect.
- Read `docs/requirements.md` and `docs/architecture.md` before implementation.
- Validate Paseo APIs against the installed version and official SDK declarations. Never invent lifecycle event fields or deep links.
- Respect plugin runtime boundaries: daemon in `server/`, shared contracts in `shared/`, Electron app in `apps/desktop/`.
- Keep UI lightweight, keyboard accessible, and non-focus-stealing.
- Avoid broad privileges, arbitrary shell execution, public network binding, and persistent secrets.
- Add tests for agent state transitions, snapshots, reconnects, and notification deduplication.
- Update README and development docs when commands or behavior change.
- Never present planned features as implemented.
