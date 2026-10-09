# Paseo Buddy Desktop (UI prototype)

Electron + React desktop application for macOS. This is a **standalone mock UI**: the number 3 and example agents are static. Real Paseo event integration, notifications, and agent navigation are not implemented.

## Local UI smoke test

Requirements: Node.js 22+; macOS for native overlay testing.

```sh
cd apps/desktop
npm install
npm test
npm run electron:start
```

The app builds the UI first, then opens an always-on-top white floating pill. Drag the robot side to move it. Click the counter to expand/collapse the example running-agent list. Right-click the window and choose **Quit Paseo Buddy** to exit; the macOS app menu also supports Command-Q.

The collapsed pill's position is saved in Electron's userData folder and restored on restart. The panel chooses a direction based on available screen space: left or right, above or below, while keeping the pill in place.

## Static checks

```sh
npm run check
```

This runs window geometry regression tests, TypeScript checking and the Vite build. The CI workflow also validates JavaScript syntax. **Neither this build nor CI replaces a macOS GUI test.**

## Known limitations

- Shows mock data only; does not communicate with Paseo.
- No real-time counts, notifications, session switching, or connection recovery.
- Frameless/transparent windows may require tuning for focus, multi-display, Spaces and full-screen workflows.
- No packaged or signed macOS app yet.
