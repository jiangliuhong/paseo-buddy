# Paseo Buddy

[简体中文](README.zh-CN.md)

A floating macOS window for keeping track of your Paseo agents.

![Paseo Buddy floating window](docs/images/paseo-buddy-pill.jpg)

## Install

Requires macOS 13+, Paseo ≥ 0.11.2 and npm. Run the Paseo daemon on your Mac in your logged-in desktop session.

1. In **Paseo → Settings → Plugins**, add `git:jiangliuhong/paseo-buddy` and enable it.
2. Open **Paseo Buddy → 悬浮窗口** and click **下载并启动** (Download and start).
3. Wait for the download to finish. The floating window starts automatically; no local compilation is needed.

Later enables reuse the downloaded companion. To update the plugin, run:

```sh
paseo plugin update paseo-buddy
```

After updating, click **下载并启动** again if a new companion is required.

## Use

- **Red badge:** running agents. **Green badge:** completed, unread agents. Zero-count badges are hidden.
- Click the pill to expand or collapse the agent list. Permission waits appear separately. Large lists show 30 agents per page with Previous/Next controls; badges still count all agents.
- Click **Open in Paseo** to open a conversation, or **Mark as read** to clear a completed agent's unread state. Opening the list alone does not mark anything read.
- Drag the pill to move it. Right-click and choose **Quit Paseo Buddy** to exit.
- Use **Tab** to focus, **Space/Return** to toggle the list, **Escape** to collapse it, and **Shift-F10** to open the menu.

In the **0.1.7 source build**, click **+** for quick chat. Choose a Project and an existing or new workspace, then a saved Agent profile; without a profile, choose a Provider and model. New workspace names are chosen by Paseo. Use **⌘ Enter** to send and **Enter** for a newline. Closing the dialog preserves the current conversation/draft in memory and leaves the task running; **New conversation** starts a separate draft. Permission requests are handled through **Open in Paseo**. Launch choices are remembered, while message text is not persisted by Buddy. If creation is rejected before any write is attempted, Buddy keeps your text and unlocks the launch choices for correction; unknown outcomes retain the original command for explicit retry.

In **悬浮窗口 → 外观**, adjust opacity, size, icon/text visibility, custom text and list height. Click **保存文本** after editing the label.

Use **启动缓存** to restart the downloaded companion, or **停止** to close it. Disabling the plugin also closes its window. If a download fails, check your GitHub connection and retry **下载并启动**.

Completion banners depend on existing macOS notification permission and Focus settings.

## Multiple hosts (0.1.5)

When the Paseo client mounts Buddy’s sidebar contribution, Buddy observes configured hosts through Paseo’s existing connections and aggregates online agents, unread state and live completion notifications. Remote cards show their host and open the owning conversation. Remote Mark as read is hidden because the borrowed API has no supported attention mutation; opening the conversation follows Paseo’s normal read behavior. Local cards retain Mark as read.

Observation continues for known hosts when the sidebar is hidden. Added/removed hosts reconcile when the sidebar contribution mounts again. Closing the Paseo client expires remote state within 15 seconds; local daemon observation continues. Offline host summaries remain visible while the relay is active, and badges count available agents only. Limits are 64 configured hosts and 5,000 total agents.

Version 0.1.7 requires its matching native release. Its source and local native build are available; publication of the matching GitHub Release remains pending. The download action cannot install this revision until those assets are published. Old native binaries do not provide quick chat.

## Development

See [development instructions](docs/development.md). Use `npm run native:start` for a local source build, or `node scripts/preview-quick-chat.mjs` after `npm run runtime:build` for an isolated native preview with simulated replies and no Paseo connection. Add `--no-profiles` to preview Provider → model selection. `node scripts/check-quick-chat-api.mjs` performs the read-only local API audit; `--contracts-only` limits it to offline contract checks. Real create/send, downloaded-release and broad GUI/accessibility acceptance remain pending.
