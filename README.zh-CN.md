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

**0.1.7 源码版本**支持点击 **＋** 打开快速对话：先选择 Project 和已有或新建工作区，再选择已有配置方案；没有方案时，先选 Provider 再选模型。新工作区由 Paseo 命名。按 **⌘ Enter** 发送，**Enter** 换行；关闭弹窗会在内存中保留当前会话和草稿，任务继续运行；**新建对话** 开启另一份草稿。需要授权时，通过 **在 Paseo 中打开** 处理。Buddy 会记住启动选项，不持久化消息正文。创建在任何写操作尝试前被拒绝时，会保留正文并解锁选项，供修正后提交；结果未知时仍保留原命令，仅允许显式重试。

在 **悬浮窗口 → 外观** 中调整透明度、大小、图标和文本显示、自定义文本及列表高度。修改文本后，点击 **保存文本**。

点击 **启动缓存** 可重新启动已下载的程序，点击 **停止** 可关闭悬浮窗。禁用插件也会关闭窗口。下载失败时，检查 GitHub 连接后重试 **下载并启动**。

关闭 Paseo 客户端后，远程状态最多保留 15 秒，本机 daemon 观察继续运行。支持最多 64 个 host、合计 5,000 个 agent；离线 host 不计入实时徽章。侧边栏隐藏期间，新增/删除 host 的列表在下次挂载侧边栏时更新，已知 host 仍会检查连接。

完成通知是否显示，取决于已有的 macOS 通知权限和专注模式设置。

0.1.7 需要配套的同版本原生程序。目前已有源码和本机构建，匹配的 GitHub Release 尚未发布；发布前，“下载并启动”无法安装这一版本。旧版原生程序没有快速对话入口。

## 开发

参见[开发文档](docs/development.md)。`npm run native:start` 可本地编译试用；运行 `npm run runtime:build` 后，`node scripts/preview-quick-chat.mjs` 会打开隔离的原生预览，使用模拟回复、不连接 Paseo；加 `--no-profiles` 可检查 Provider → 模型路径。`node scripts/check-quick-chat-api.mjs` 用于只读核实本机接口，加 `--contracts-only` 则仅检查离线参数契约。真实创建/发送、发布二进制和更广泛的 GUI／辅助功能验收尚未完成。
