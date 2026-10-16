# Paseo Buddy

[English](README.md)

一个 macOS 悬浮窗口，随时查看 Paseo agent 的运行和未读状态。

![Paseo Buddy 悬浮窗口](docs/images/paseo-buddy-pill.jpg)

## 安装

需要 macOS 13+、Paseo ≥ 0.11.2 和 npm。Paseo daemon 需运行在本机已登录的桌面会话中。

1. 打开 **Paseo → Settings → Plugins**，添加 `git:jiangliuhong/paseo-buddy` 并启用插件。
2. 进入 **Paseo Buddy → 悬浮窗口**，点击 **下载并启动**。
3. 下载完成后，悬浮窗口会自动启动，无需本地编译。

后续启用会复用已下载的程序。更新插件时运行：

```sh
paseo plugin update paseo-buddy
```

更新后如需新版悬浮窗程序，再点击一次 **下载并启动**。

## 使用

- **红色徽章**：正在运行的 agent 数量。**绿色徽章**：已完成但未读的 agent 数量。数量为 0 时隐藏徽章。
- 点击胶囊展开或收起 agent 列表，等待权限确认的 agent 单独显示。较长列表每页显示 30 个 agent，可用 Previous/Next 翻页；徽章仍统计全部 agent。Paseo 客户端运行并挂载 Buddy 侧边栏组件后，会汇总已配置 host 的在线任务；远程卡片显示 host 名称，离线 host 显示连接状态。
- 远程任务支持计数、未读状态、完成通知和 **Open in Paseo**；远程已读通过打开对话同步，暂不提供 **Mark as read**。本机卡片保留该按钮。
- 点击 **Open in Paseo** 打开对应对话；点击 **Mark as read** 将已完成的 agent 标记为已读。仅展开列表不会自动标记已读。
- 拖动胶囊调整位置；右键选择 **Quit Paseo Buddy** 退出。
- 按 **Tab** 聚焦，**空格/回车** 展开或收起列表，**Escape** 收起列表，**Shift-F10** 打开菜单。

在 **悬浮窗口 → 外观** 中调整透明度、大小、图标和文本显示、自定义文本及列表高度。修改文本后，点击 **保存文本**。

点击 **启动缓存** 可重新启动已下载的程序，点击 **停止** 可关闭悬浮窗。禁用插件也会关闭窗口。下载失败时，检查 GitHub 连接后重试 **下载并启动**。

关闭 Paseo 客户端后，远程状态最多保留 15 秒，本机 daemon 观察继续运行。支持最多 64 个 host、合计 5,000 个 agent；离线 host 不计入实时徽章。侧边栏隐藏期间，新增/删除 host 的列表在下次挂载侧边栏时更新，已知 host 仍会检查连接。

完成通知是否显示，取决于已有的 macOS 通知权限和专注模式设置。

0.1.6 需要配套的同版本原生程序。更新插件后，先停止旧悬浮窗，再点击 **下载并启动** 安装匹配的程序；旧版原生程序不包含这些变更。
