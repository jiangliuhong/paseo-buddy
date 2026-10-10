# Paseo Buddy Desktop

Electron + React desktop application for macOS. The main process subscribes to live local Paseo agents through the official SDK and exposes only normalized state to the renderer. Notifications and agent navigation remain planned.

## Local smoke test

Requirements: Node.js 22+, npm, Paseo >=0.11.1 running locally, and macOS for native overlay testing.

From the repository root:

```sh
npm install
npm run check
npm run electron:start
```

The root `package.json` declares `apps/desktop` as an npm workspace, so running `npm install` at the root installs desktop dependencies, including `@types/react`, `react-dom`, `lucide-react`, `vite`, and their TypeScript declarations.

If you are already in `apps/desktop`, `npm run electron:start` also works after installing workspace dependencies.

If upgrading from a version without workspaces, run `git pull && npm install` from the repository root. Confirm resolution with `npm ls react vite @types/react --workspace @paseo-buddy/desktop`.

The app builds the UI first, then opens a compact 88 × 36 px floating pill without taking focus. On macOS the application hides its Dock icon; use the pill’s right-click menu to quit. Drag anywhere on the pill to move it. Click anywhere on the pill to expand/collapse the live running-agent list. Right-click the window and choose **Quit Paseo Buddy** to exit; the macOS app menu also supports Command-Q.

The collapsed pill's position is saved in Electron's userData folder and restored on restart. The panel chooses a direction based on available screen space: left or right, above or below, while keeping the pill in place.

## Static checks

```sh
npm run check
```

This runs agent state/reconnect and window geometry regression tests, TypeScript checking and the runtime/Vite build. CI performs a root-level fresh dependency install as well. **Neither this build nor CI replaces a macOS GUI test.**

## Known limitations

- No completion notifications or conversation navigation yet.
- Requires a loopback TCP daemon endpoint in `paseo.pid`; Unix sockets and public bindings are unsupported.
- No packaged daemon launch or automatic plugin-driven desktop startup.
- Frameless/transparent windows may require tuning for focus, multi-display, Spaces and full-screen workflows.
- DMG/ZIP packaging is available; Apple Developer signing and notarization remain unconfigured.

Buddy uses `PASEO_HOME` or `~/.paseo` to discover the endpoint and existing local credential. Start Paseo first; the pill displays `—` while disconnected and retries automatically. Permission-blocked agents appear separately and are excluded from the running count. Elapsed time is measured from the daemon turn timestamp. Browser-only Vite previews display disconnected state because the Electron IPC API is absent.

The pill shows running agents in red and completed unread agents in green; both counts appear when both states exist. Completed unread agents have their own list section. Unread state comes from Paseo (`requiresAttention` with `attentionReason: "finished"`) and clears when read in Paseo. Opening Buddy does not mark anything read. Errors and permission waits do not count as successful unread completions.

Truncated project/workspace and agent names show their full text in a custom preview after 120ms of hover. Keyboard focus shows it immediately. Escape, scrolling the list, or leaving the preview dismisses it. The preview wraps within the window and supports scrolling for very long names.

To produce standalone macOS packages, run `npm run desktop:package -- --arm64 --x64` from the repository root. See [release instructions](../../docs/releasing.md).
