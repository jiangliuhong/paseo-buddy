# Registry review readiness

Review: https://github.com/getpaseo/plugins/pull/299#pullrequestreview-5478845069

## Current implementation

The working tree uses a native Swift/AppKit companion. The v0.1.4 installation flow now downloads a matching GitHub Release after one explicit settings-button click. Earlier local-build and Electron release evidence does not establish downloaded-binary acceptance for this revision. [v0.1.4](https://github.com/jiangliuhong/paseo-buddy/releases/tag/v0.1.4) is published; real GitHub download/cache validation is recorded below.

- Activation starts only a verified version/architecture/source/binary-matched cache without network access.
- **下载并启动** downloads the fixed release executable and manifest; it needs no compiler or second confirmation. Source/version/architecture and SHA-256 are checked before atomic cache publication or launch.
- Downloads have size/deadline bounds and checked GitHub HTTPS redirects. Stop/disable cancel downloads, clean staging and stop only the owned process. Failed downloads permit retry.
- Local builds remain a developer option. Unknown/corrupt caches and legacy Electron files are preserved. No Gatekeeper modification, quarantine removal, administrator access or tool installation occurs.
- The native child receives normalized snapshots over stdin. Credentials and SDK observation stay in Node; no new listener is opened. The owned process must report READY before observation starts.
- Paginated directory snapshots load completely before display. Buffered updates are replayed after loading. Invalid cursors, failed pages, oversized directories and buffer overflow clear state and reconnect; late superseded results cannot overwrite a new snapshot.
- Opacity/scale settings apply live; native geometry preserves the pill anchor. Keyboard controls and the grouped agent list are implemented. Opening Buddy never clears daemon attention.

Completion/failure notification delivery is implemented for live SDK terminal events with explicit turn IDs. The pill context menu contains only Quit Paseo Buddy; no authorization request is offered. Existing macOS permission is required for delivery; denied permission does not block the overlay. Conversation navigation uses the official agent deep-link helper with the selected daemon identity, and opening this project's conversation has been verified in the real desktop app. Actual notification authorization/banner delivery remains pending. The v0.1.4 commit/tag/Release are published. Registry edits and reviewer replies have not been performed.

## Automated evidence

The installed application reports Paseo 0.11.2; the repository uses official plugin/client SDK declarations at 0.11.1. The SDK declares directory pagination, creation-time sort, request AbortSignal and owned subscriptions used by the observer.

Local validation on 2026-10-15: `npm run check` passed TypeScript checking, runtime compilation, all 93 Node tests and plugin bundling without launching a native window. The suite covers state transitions, placement retention across idle periods, read/unread snapshots, paginated hydration/update races, superseded snapshots, cancellation, reconnect/backoff, directory growth limits, settings, build consent, cache integrity, build concurrency, startup/shutdown lifetime races, notification identity/deduplication, timeline cleanup and stdin backpressure boundaries. Unit tests use injected clients/processes. There is no standalone lint configuration; `git diff --check` passed whitespace checks.

`npm run native:check` also passed locally on 2026-10-15: it compiled the actual AppKit definitions and ran real NSView pill hit-testing, anchor geometry, snapshot/notification decoding and navigation validation checks without opening windows. This does not prove Intel execution, accessibility or full GUI behavior.

`npm run native:build` compiled and validated the final Apple Silicon app bundle. Its embedded source SHA-256 is `e5fb174fa6994f3bf1b73c796a955400e5eb5764fb58f6356746d398abc03b99`. Runtime dependencies are client/protocol SDK 0.11.1 and Zod; no Electron runtime is present.

## v0.1.4 download-flow validation

On 2026-10-15, `npm run check` passed all 93 tests, TypeScript and both plugin bundles. `npm run native:check` passed. `node scripts/package-native-release.mjs` compiled both release executables: `file` identified arm64 and x86_64 Mach-O binaries. Both actual generated binary/manifest pairs passed the production download/cache-install path using an injected local-file transport, without launching a window. This validates asset layout and integrity contracts, not live GitHub networking or downloaded-binary GUI execution. At the time of that local check, all four assets were under `build/release` and publication had not yet occurred.

## Published v0.1.4 evidence

Published on 2026-10-15 from tag `v0.1.4` at `1c91cc9be021b67e3e2409658393b73d775f69a4`. Workflow ordering was corrected on main in `af46228`; the existing tag was preserved. [Release workflow run 38737135628](https://github.com/jiangliuhong/paseo-buddy/actions/runs/38737135628) passed both build and publish jobs using that tagged source. It passed the 93-test suite, native checks and both architecture builds before publication.

The public Release API reports a non-draft, non-prerelease release with all four assets. Production `ensureCompanion` downloaded the actual GitHub assets for arm64 (365,960 bytes) and x64 (351,232 bytes), verified manifest/source/version/architecture/SHA-256, and installed each in a temporary cache. Both passed; temporary caches were removed and no downloaded executable was launched. Real downloaded-window startup, Intel execution and system notification delivery remain pending.

## Local desktop and daemon evidence

Verified on the local Apple Silicon desktop with Paseo 0.11.2 on 2026-10-15:

- `npm run native:start` reached READY, connected to the real local daemon, showed live running/unread counts and displayed grouped project/workspace/agent rows with elapsed labels.
- The list expanded and its native Scroll Up action moved the scroll position. Real running/read-unread transitions updated the window while observation continued.
- Selecting this project's **Open in Paseo** button opened its correct conversation/workspace in the installed desktop app.
- In an earlier interactive build, Tab focused the pill and Shift-F10 opened its menu with focus, notification-authorization and Quit actions.
- `npm run daemon:check` passed a real read-only connection/reconnection cycle. It closed only the observer's SDK connection and obtained a fresh full snapshot; the daemon itself was not restarted. A final run observed running, unread and permission-wait entries with navigation identity available. No agent task or desktop notification was sent by the check.
- An owned developer session stopped with Ctrl-C. After the later interrupted UI session, a process check found no companion process under this checkout's `build/native` path.

The interactive build preceded the final focus-ring polish, context-menu simplification and adaptive list height; the final source was subsequently compiled and model-checked. A later menu/Space interaction was interrupted and is not counted as a successful check. The UI automation repeatedly encountered changing live state, so Escape from a focused row, drag, appearance changes and focus restoration remain explicit manual checks. No notification permission was granted, no system banner delivery was asserted, and no screenshot containing private live workspace names was saved for publication.

## Required manual macOS acceptance

Run on Apple Silicon and Intel in a local desktop session. Preserve existing caches and independently running apps.

1. Enable with no matching native cache: no compiler, download or child process. Snapshot RPC remains usable and settings provide 下载并启动.
2. Click **下载并启动** with the matching release published: verify the matching architecture asset downloads and starts without developer tools or a second confirmation.
3. Double-click or use a second settings session: only one operation and one owned process; valid app/manifest hashes, no residual staging directories, one nonactivating floating window and local agent updates.
4. Stop/disable during download: staging is cleaned and no child launches. Retry with the same button. Missing release, offline GitHub, timeout and corrupt/wrong-version assets produce visible errors without compilation or security bypasses.
5. Re-enable with valid cache: starts without compilation or network. Cached start and Quit/restart work.
6. Corrupt an isolated current cache: cached start fails closed; download preserves it and requests explicit repair. Older native and legacy Electron caches remain untouched.
7. Start a second copy using the same native cache root: the native lock prevents duplicate windows. Stop affects only the owned child. A developer window using a different cache root is independent.
8. Exercise three simultaneous turns, completion/read updates, permission waits and elapsed labels. Verify paginated directories and updates during hydration never show a partial count. Restart the daemon mid-turn: clear stale state, rediscover endpoint/credential and reconcile from a fresh full snapshot.
9. Verify opacity/scale, drag, collapse/expand, scroll position, multiple displays and full-screen behavior. Check keyboard focus, Space/Return, Escape and VoiceOver without incidental focus stealing.
10. On unsupported platforms/architectures: no compilation/spawn and build/start actions disabled. Disconnect or close the parent: no orphaned native process.
11. Before granting notification permission, finish/fail a turn: no prompt, focus change or historical backlog. On an installation with existing macOS authorization, finish/fail a newly observed turn: one notification attempt per explicit turn ID. Repeat an event, reconnect and read/unread the agent: no duplicate. Cancel a turn or restart with completed unread agents: no completion alert. Deny permission: counts and reconnects still work. Verify actual banners with Focus disabled and notification preferences enabled; test permission denial separately.
12. Open the list without selecting a row: Paseo stays in the background and unread state remains unchanged. Select **Open in Paseo** using mouse and keyboard: the intended agent on the selected local host opens. Missing server identity hides navigation; encoded IDs cannot alter the route or launch another scheme. Verify Paseo's normal read behavior after selection.

The list above remains the full acceptance checklist. The local evidence completes only the specific portions recorded above. End-to-end release download/settings disable, daemon-process restart, notification permission/banner delivery, Intel execution, VoiceOver and multi-display/full-screen behavior still require manual acceptance. Do not infer their success from unit tests, compilation or observer-only reconnect.

## Interface screenshot

`docs/images/paseo-buddy-pill.jpg` is an unmodified screenshot of the actual running native floating pill, captured on 2026-10-15 through the macOS app screenshot API. The original JPEG is 256 × 88 pixels. It shows Buddy branding with a red running badge and a green unread badge. It contains no project/workspace names, conversation titles, paths or surrounding desktop content. The saved file was visually inspected and is referenced from README and OVERVIEW.

The screenshot was captured from the installed 0.1.3-native.1 app (source identity `e5fb174fa6994f3b`), whose embedded Swift UI source is unchanged in 0.1.4-native.1. It is evidence of the real native pill, not downloaded-v0.1.4 execution, expanded-list acceptance, or the remaining manual acceptance scenarios. No AI rendering, fixture UI or image retouching was used.

Commit/push of the screenshot is authorized by the user. For Registry media, use the public raw GitHub HTTPS `.jpg` URL at the screenshot commit and verify HTTP 200 and `image/jpeg` after pushing. Registry acceptance and listing changes remain reviewer-owned; a screenshot commit alone does not mean Registry publication is complete.

A reviewer reply should link the actual reviewed commit, explain the explicit release-download action and cache validation, provide this interface image, and state checks and manual acceptance actually performed. Do not reuse the older Electron installation/download reply draft.

## Pill collapse regression

The custom pill hit test incorrectly compared a superview-coordinate point with local bounds. It worked at frame origin zero while collapsed, but rejected clicks after expansion moved the pill. The override has been removed so AppKit handles coordinate conversion. Before the fix, the native regression failed with `Expanded pill must remain clickable`; after the fix it passes for collapsed and both expanded positions at 0.75×, 1× and 1.5× scale, including out-of-bounds rejection. The Node suite and plugin build also pass. This is an automated hit-testing regression; it does not replace a real two-click desktop check.

## Native appearance and full-screen drag update

The native pill now uses an SF Symbol, rounded tinted count badges, hover/focus feedback and a separate popover-material list surface. Grouped cards show subdued project/workspace metadata, two-line agent titles and compact elapsed/navigation footers. The final real running interface was visually inspected locally, including a two-line long title, compact status/navigation footers and the separate pill/list surfaces; private live agent names were not saved as publication media.

Dragging now tracks the pill anchor, clamps against the full physical `NSScreen.frame` and bypasses AppKit’s visible-frame window constraint. It can reach the bottom edge inside the region reserved for the Dock. `overlayLayout` places the list above/below the pill and reduces list height when space is limited, rather than letting the list block the pill or pull its anchor away from the screen edge. Native checks cover a simulated Dock reservation, negative-coordinate displays, constrained screen heights, all supported scales, non-overlap and collapse-anchor preservation. Physical pointer dragging to the Dock edge remains a manual check; it is not claimed from a screenshot.

## Pill identity and compact counts

Paseo settings now expose icon visibility, text visibility and an explicitly saved custom single-line label. New fields have additive defaults under display schema version 1, preserving saved opacity/scale and leaving Buddy/icon enabled by default. The native appearance mirror and decoder accept legacy values and apply new identity fields without restart.

The running badge now hides at zero, matching unread behavior. Pill geometry removes absent icon/text/badge slots and their gaps, retaining only a 44-point clickable capsule when everything is hidden. Native checks pass for all icon/text combinations, no/one/two badges, capped custom label widths and anchor preservation at all supported scales. Node tests cover old-setting defaults, text/boolean validation and live mirror updates. Actual interaction with the new Paseo settings controls remains a manual acceptance item after reloading the updated plugin; the independently started developer window uses default identity settings.

The pill expand/collapse chevron now uses AppKit primary `labelColor` instead of `tertiaryLabelColor`, providing a stronger foreground in both system appearance modes without adding reserved width or changing the click target.

## Segmented toggle styling

The supplied ChatGPT screenshots informed a lighter, segmented toolbar: monochrome iconography, fine dividers, a dedicated 44-point toggle zone and a round-cap 14-point chevron. The unread count now sits in a green corner badge over the toggle zone instead of a separate count slot. Zero counters and disabled identity elements still reserve no space. Native layout/appearance/hit-testing checks and the actual native build passed, including badge containment and stable anchors with the updated widths.

## Hover actions and explicit read state

Open in Paseo and Mark as read use a rounded accent-tinted hover background and hand cursor. Mark as read appears only for completed-unread cards, disables while pending and sends a strict bounded stdout request containing a request UUID, agent ID and attention timestamp. Node revalidates the displayed completion, then a short-lived client fetches fresh state and invokes the installed SDK’s `clearAgentAttention` operation. This API and its wire shape were verified in the installed Paseo 0.11.2 app as well as SDK 0.11.1 declarations. No arbitrary RPC or shell bridge exists, and opening the list itself remains side-effect free.

The 80-test Node suite passes, including stale/active/permission/wrong-host rejection, partial and oversized command handling, replay/concurrency limits, cancellation, late results, timeouts, result-queue priority and credential-free failures. Native checks pass command/result JSON compatibility alongside existing layout/protocol checks; the actual native app bundle builds. These mutation tests use injected SDK clients, not real conversations. End-to-end marking of a real completion and pointer-hover appearance remain manual acceptance items; do not infer a real read mutation from the build or mocks.

## Dual corner counts

The middle waveform and inline running number have been removed. Running and unread values now share the top-right corner as separate red/green badges, red on the left and green on the right. Zero values hide independently; one badge fits inside the normal toggle width. With two badges the toggle grows only as needed for the badge widths and a 3-point gap, keeping the arrow centered and both badges within bounds. Native checks pass for zero/single/dual counts, 99+ widths, hidden icon/text combinations, non-overlap and anchor preservation at all supported scales.

The pill’s custom blue focus stroke and AppKit focus ring have been removed. Clicking it retains the clean capsule outline; keyboard handlers and first-responder behavior remain, with only neutral toggle-background feedback. Native source/model compilation and the plugin build pass for this presentation-only change.

Current list bounds default to 140–360 points and are configurable in appearance settings. Native checks cover legacy defaults, invalid bounds and content fitting at all supported scales; visual acceptance of short/long lists remains manual.

## Pill expansion responsiveness (2026-10-16, working tree)

Code inspection found unbounded synchronous AppKit card/constraint construction on expansion and every expanded snapshot update. The working tree bounds construction to 30 cards with Previous/Next controls, reuses unchanged documents on reopening, and coalesces IPC render bursts over 50 ms. Badge totals still include the complete snapshot. The inactive pill accepts the first mouse click, and elapsed labels use preconfigured date formatters. Native checks cover all 5,000 agents across pages without omissions/duplicates, status ordering, page clamping after removals, cache invalidation inputs, first-mouse acceptance and both timestamp formats.

The 107-test Node suite, TypeScript checks and plugin build pass. Native checks compile the embedded Swift source, and `npm run native:build` produced the current arm64 companion successfully. This does not establish a measured desktop latency improvement: the reported intermittent delay has not been reproduced in a real desktop session. Real inactive-window clicks, rapid updates and paging remain GUI acceptance items. These changes require a matching newly built native companion; the published release does not contain this working-tree fix.

## v0.1.6 release preparation (2026-10-16)

Updated the plugin package/lock, native companion version, Info.plist, fixed download tag and workflow default together to v0.1.6. `npm run check` passed all 107 tests, TypeScript checking and both plugin bundles. The actual-source native checks passed. `node scripts/package-native-release.mjs` produced arm64 and x86_64 Mach-O executables and matching manifests. Both generated pairs passed the production download/cache-install path using an injected local-file transport, including subsequent validated cache reuse, without launching a window. This establishes packaging and source/version/checksum compatibility, not live GitHub download or GUI latency acceptance. Release notes explicitly retain those limitations.
