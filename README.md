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
- Click the pill to expand or collapse the agent list. Permission waits appear separately.
- Click **Open in Paseo** to open a conversation, or **Mark as read** to clear a completed agent's unread state. Opening the list alone does not mark anything read.
- Drag the pill to move it. Right-click and choose **Quit Paseo Buddy** to exit.
- Use **Tab** to focus, **Space/Return** to toggle the list, **Escape** to collapse it, and **Shift-F10** to open the menu.

In **悬浮窗口 → 外观**, adjust opacity, size, icon/text visibility, custom text and list height. Click **保存文本** after editing the label.

Use **启动缓存** to restart the downloaded companion, or **停止** to close it. Disabling the plugin also closes its window. If a download fails, check your GitHub connection and retry **下载并启动**.

Completion banners depend on existing macOS notification permission and Focus settings.

## Multiple hosts (0.1.5)

When the Paseo client mounts Buddy’s sidebar contribution, Buddy observes configured hosts through Paseo’s existing connections and aggregates online agents, unread state and live completion notifications. Remote cards show their host and open the owning conversation. Remote Mark as read is hidden because the borrowed API has no supported attention mutation; opening the conversation follows Paseo’s normal read behavior. Local cards retain Mark as read.

Observation continues for known hosts when the sidebar is hidden. Added/removed hosts reconcile when the sidebar contribution mounts again. Closing the Paseo client expires remote state within 15 seconds; local daemon observation continues. Offline host summaries remain visible while the relay is active, and badges count available agents only. Limits are 64 configured hosts and 5,000 total agents.

The development branch targets 0.1.5 and requires its matching native release. Until those assets are published, validate using the developer build; old native binaries do not implement these changes.
