# Paseo Buddy

A lightweight macOS floating companion for Paseo agents. Red numbers show running agents; green numbers show completed agents that remain unread in Paseo.

Click the pill to view project, workspace, agent name, status, and elapsed time. Drag anywhere to move it. The window stays out of the Dock, remembers its position, and supports opacity and size controls under **Settings → Plugins → Paseo Buddy → 悬浮窗口**.

## Installation

Requires **Paseo ≥ 0.11.1**, **npm**, and a local macOS daemon running in the logged-in desktop session.

Open **Paseo Settings → Plugins**, enable plugins, paste the following into **Plugin source**, and select **Install plugin**:

```text
git:jiangliuhong/paseo-buddy
```

Alternatively, install through the CLI:

```sh
paseo plugin add git:jiangliuhong/paseo-buddy
```

Enabling the plugin automatically downloads, verifies, and starts the floating companion. No manual DMG download is needed. The first launch downloads about 100 MB and may take a few minutes; later launches reuse the cache. Disable the plugin to close its managed window.
