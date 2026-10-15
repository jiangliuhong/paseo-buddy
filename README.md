# Paseo Buddy

A native macOS floating companion for Paseo agents, built with Swift/AppKit. Red numbers show running agents; green numbers show completed unread agents. Click the pill for project/workspace/agent details and a separate permission-wait section. The pill uses a segmented monochrome toolbar, red running and green unread corner badges at the top right; the expanded list uses a translucent rounded panel and grouped agent cards. Drag the pill anywhere within the full screen, including the area reserved for the Dock; right-click for keyboard focus or Quit. Tab focuses the pill; Shift-F10 opens its controls menu. Clicking the pill does not add a blue focus outline. Opening Buddy never automatically marks agents read. Completed-unread cards include **Mark as read**, which explicitly updates Paseo; **Open in Paseo** has a rounded hover highlight and hand cursor.

## Install and start

Requires Paseo ≥ 0.11.1, npm for plugin preparation, **macOS 13+**, and **Apple Command Line Tools or Xcode** on the local daemon machine. The daemon must run in your logged-in desktop session. Apple Silicon and Intel targets are supported; Intel native execution still needs hardware acceptance testing.

In Paseo Settings → Plugins, install `git:jiangliuhong/paseo-buddy`, or use:

```sh
paseo plugin add git:jiangliuhong/paseo-buddy
```

Enable the plugin, then open **Settings → Plugins → Paseo Buddy → 悬浮窗口 → Build and start native companion**. Review its version, bundled Swift source identity, SHA-256 and requirements, then select **Confirm build and start**. Cancel does not compile or launch anything. First compilation can take several minutes.

There is **no Electron dependency, separate application download, ZIP extraction or DMG installation**. Swift source is included in the plugin's reviewed Git revision at [server/native-source.ts](server/native-source.ts); it is compiled locally with Apple's tools only after confirmation. The plugin never installs developer tools, requests administrator access, bypasses Gatekeeper or downloads a compiler. Install missing tools yourself using [Apple's instructions](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools/).

A valid build matching the source/architecture and cached executable SHA-256 starts on later plugin enables without recompilation. Source changes require fresh confirmation. Settings include **Start cached companion**, **Stop companion**, opacity, size, **显示图标**, **显示文本** and **自定义文本**. Under **悬浮窗口 → 外观**, text can be saved as a single line of up to 32 characters; disabling text preserves the saved label. The pill automatically shrinks when branding or zero-count badges are hidden, keeping a small clickable capsule when all content is hidden. Disable stops only the owned native child and cancels pending compilation. Native output is cached under `~/Library/Caches/Paseo Buddy/native`; old Electron caches/settings are left untouched. Quit old Electron copies manually before switching.

See [OVERVIEW.md](OVERVIEW.md) for privacy, retry/rebuild instructions and troubleshooting, and [docs/review-readiness.md](docs/review-readiness.md) for validation limits and screenshot status.

## Development

```sh
npm ci --ignore-scripts
npm run check          # TypeScript, Node tests, plugin bundles; no native launch
npm run native:check   # macOS: compile AppKit source and run geometry/model checks; no window
npm run native:build   # macOS: compile current source under build/native
npm run native:start   # macOS: explicitly compile/reuse and start a real window
npm run daemon:check   # read-only local daemon snapshot and observer reconnect check
```

The native window receives normalized state and action results through an inherited pipe. Its only reverse action is an explicit **Mark as read** request for a displayed unread completion; credentials stay in Node. The plugin's Node process handles local daemon credentials, observation and reconnects. Paginated snapshots load fully before counts appear; live events received during loading are applied afterward. Invalid or oversized snapshots clear the count and trigger a retry. No extra listening port is opened. Completion/failure notifications are implemented for live terminal events with a turn ID. The pill context menu contains only **Quit Paseo Buddy**. Notification delivery requires existing macOS authorization; this menu no longer offers a permission request. Startup/reconnect snapshots and canceled turns do not notify; events missed while disconnected are not replayed. System permission, Focus settings and banner preferences control visibility. Agent rows offer **Open in Paseo** when the local daemon identity is available. Routes use the official SDK helper; only an explicit button press opens Paseo. Desktop routing to this project’s conversation has been verified locally with Paseo 0.11.2; broader platform acceptance is recorded in the review notes.

Agents 列表按实际内容自适应高度，默认最小 140 pt、最大 360 pt（保留原高度上限）；插件外观设置可调整上下限，随整体大小同比例缩放。内容超过上限时滚动，屏幕空间不足时进一步收缩。右键菜单仅保留 **Quit Paseo Buddy**；Tab、Space/Return、Escape 和 Shift-F10 键盘操作仍可用。
