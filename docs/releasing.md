# Releasing Paseo Buddy

The source repository contains a Paseo daemon plugin and a standalone macOS desktop app. A plugin installation does not start the desktop app.

## Verify and package

```sh
npm ci --include=dev
npm run check
npm run desktop:package -- --arm64 --x64
```

Packages are written to the ignored `release/` directory. `desktop:stage` builds the renderer, copies the Electron entry/preload/helpers into `build/desktop`, and bundles the SDK observation adapter into `runtime/live-agents.mjs` with esbuild. The staged app has no external runtime dependencies or repository-relative imports. The generated package does not need Node.js or npm on the user's machine.

The checked-in app icon is generated from vector drawing code in `scripts/create-icon.m`. To regenerate it on macOS:

```sh
clang -fno-modules -framework AppKit scripts/create-icon.m -o /tmp/paseo-buddy-create-icon
/tmp/paseo-buddy-create-icon assets/icon.png
```

The current configuration uses ad-hoc signing so the app has a consistent local code signature, but it is not Apple Developer signed or notarized. It is published as an unsigned preview for distribution purposes. Developer signing and notarization require a separately configured Apple identity; no signing credential is stored in this repository. `LSUIElement` and runtime Dock hiding keep the app out of the Dock.

## GitHub Release

Keep root and desktop package versions aligned, update the lockfile, and write release notes before tagging. A `v*` tag triggers `.github/workflows/release.yml`, which runs verification, packages both macOS architectures, writes checksums, and publishes a prerelease with those assets. `workflow_dispatch` builds downloadable workflow artifacts without creating a release.

The workflow currently uses `docs/releases/v0.1.0.md` as its notes file. Update that file selection for future release versions. `contents: write` is restricted to the final publishing job; packaging has read-only repository permission.

## Git-source plugin

The manifest's preparation command runs `npm ci --omit=dev --ignore-scripts --workspaces=false` so plugin runtime dependencies are installed without Electron workspace tooling. Commit `package-lock.json`, the TypeScript plugin sources, `OVERVIEW.md`, and manifest assets. The daemon compiles the TypeScript source itself.

Users can install the Git source with:

```sh
paseo plugin add git:jiangliuhong/paseo-buddy --ref v0.1.0
```

The official plugin registry is a separate reviewed listing, not created automatically by a GitHub Release. Registry submission requires a pinned repository revision and `OVERVIEW.md`.
