# Paseo Buddy

A native macOS floating companion for Paseo agents, built with Swift/AppKit. Red numbers show running agents; green numbers show completed unread agents. Click the pill for project/workspace/agent details and a separate permission-wait section. The pill uses a segmented monochrome toolbar, red running and green unread corner badges at the top right; the expanded list uses a translucent rounded panel and grouped agent cards. Drag the pill anywhere within the full screen, including the area reserved for the Dock; right-click for keyboard focus or Quit. Tab focuses the pill; Shift-F10 opens its controls menu. Clicking the pill does not add a blue focus outline. Opening Buddy never automatically marks agents read. Completed-unread cards include **Mark as read**, which explicitly updates Paseo; **Open in Paseo** has a rounded hover highlight and hand cursor.

## Install and start

Requires Paseo ≥ 0.11.1, npm for plugin preparation, and **macOS 13+** on the local daemon machine. The daemon must run in your logged-in desktop session. Apple Silicon and Intel release binaries are supported; Intel native execution still needs hardware acceptance testing.

In Paseo Settings → Plugins, install `git:jiangliuhong/paseo-buddy`, or use:

```sh
paseo plugin add git:jiangliuhong/paseo-buddy
```

Enable the plugin, then open **Settings → Plugins → Paseo Buddy → 悬浮窗口 → 下载并启动**. This button downloads the matching native executable from this repository's GitHub Release, verifies version, architecture, bundled-source identity and SHA-256, and starts the floating window. No Xcode, Command Line Tools, local compilation, separate application download or extraction is required. Later enables reuse a valid cache without network access. Source/version changes require clicking the button again. The settings also offer cached start and stop. Download failures can be retried with the same button.

Release binaries must be published before the matching plugin can download them. The matching [v0.1.4 release](https://github.com/jiangliuhong/paseo-buddy/releases/tag/v0.1.4) is published with all four assets. The version-tag workflow validates, builds and publishes them; an unpublished future version reports that its release is unavailable. Downloads are HTTPS-only and restricted to GitHub release hosts. SHA-256 detects content corruption; it is not Apple Developer signing or notarization. The plugin never changes Gatekeeper or removes quarantine.

Appearance settings include opacity, size, **显示图标**, **显示文本**, **自定义文本**, and list height bounds. Native output is cached under `~/Library/Caches/Paseo Buddy/native`. Disable cancels downloads and stops only the owned native child. Existing unknown/invalid caches and old Electron files are preserved; quit old Electron copies manually before switching.

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
