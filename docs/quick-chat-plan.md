# 快速对话功能规划

状态：交互原型、Node 服务、受限 IPC 和 AppKit 原生弹窗已接入 0.1.7 源码。已完成官方接口核实、本机只读验证、注入客户端/原生控制器测试和离屏渲染检查；真实创建、发送、自动命名效果、实际窗口焦点与正式发布仍待验收。

## 目标与范围

在悬浮条增加独立的“新对话”按钮，用户点击后即可输入消息并创建 Paseo 会话。保留现有运行数、未读数和列表入口。

首版支持本机 Paseo、选择 Project、新建工作区或在已有工作区新建 Agent、已有配置方案及 Provider → 模型选择、纯文本消息和连续对话。新工作区不要求输入名称，由 Paseo 决定。初始弹窗移除中间空状态区，保持紧凑。弹窗显示文字回复、运行状态、错误与权限等待提示，提供“在 Paseo 中打开”。附件、语音、完整工具日志、权限审批、远程主机创建和全局快捷键留待后续。

会话会使用所选工作区及 Paseo 的工具权限配置，创建区必须清楚展示工作区和模型。快捷入口不默认提高权限。权限请求交给 Paseo 处理。

## 交互

1. 悬浮条新增独立的加号/对话图标按钮，支持 Tab、Space/Enter 和辅助功能名称；按钮点击与拖动分别命中。显示设置隐藏图标或文字时，仍保留两个操作入口。
2. 点击按钮打开与悬浮条相邻的原生对话面板，并聚焦输入框。仅用户明确打开时获取输入焦点；后台状态更新不会激活窗口。对话面板与现有列表互斥，布局避让屏幕边缘和 Dock，保持悬浮条锚点。
3. 先选本机 Project，再选已有工作区或“新建工作区”；新建时不显示名称输入框。有配置方案时优先直接选择方案，带入 provider、模型、mode、thinking 和 featureValues；没有方案时先选 Provider 再选模型。之后记住上次有效选择并再次验证。没有可用选择时明确引导去 Paseo 配置，不从当前前台应用猜测目录。
4. 输入支持中文输入法、换行和 Cmd+Enter 发送。空白内容不可发送；输入法候选确认不触发提交。提交后展示消息列表和流式文字回复，首版在当前轮次结束前禁用再次发送，避免 SDK 默认中断运行中的轮次。
5. 关闭或按 Escape 隐藏面板，不停止会话；同一原生进程内再次打开恢复当前会话和草稿。“新建”开启另一份草稿，旧会话仍可从 Paseo 访问。首版草稿仅保存在内存中，退出后不恢复。
6. 运行完成后可继续发送；需要授权时显示“等待授权”和“在 Paseo 中处理”。错误保留输入及会话入口。打开面板本身不自动标记已读。

## 接口核实记录（2026-10-16）

核实对象：仓库固定的 `@getpaseo/client` / `@getpaseo/protocol` 0.11.1 官方声明及实现、`/Applications/Paseo.app` 0.11.4 安装包内的 client/protocol/server 实现，以及当前本机 daemon。安装包中三包版本均为 0.11.4；其 client 的 `dist/index.js`、`dist/creation/index.js`、`dist/timeline-subscription/index.js` 与仓库 0.11.1 对应文件逐字节相同。此结论仅针对这些文件，不代表整个 SDK 完全相同或所有写操作已通过真实验收。

| 原型能力 | 已核实接口与字段 | 验证层级 |
| --- | --- | --- |
| 配置方案 | `api.config.get()` → `config.agentProfiles`，包含 `id/name/provider/model?/modeId?/thinkingOptionId?/featureValues?` | 声明、安装实现、本机读取 |
| Project 列表 | `api.projects.list()` → `projects`，含 `projectId/projectRootPath/projectDisplayName/projectKind` | 声明、安装实现、本机读取 |
| 已有工作区 | `api.workspaces.list({filter:{projectId},page:{limit,cursor?}})` | 声明、安装实现、本机读取；单页上限 200 |
| 新建工作区 | `api.workspaces.create({source,firstAgentContext:{prompt},idempotencyKey})` | 声明、安装实现、模拟参数校验；未真实创建 |
| 已有工作区新建 Agent | `api.workspaces.ref(workspace).agents.create({config,idempotencyKey})` | 声明、安装实现、模拟参数校验；未真实创建 |
| Provider 与模型 | `providers.snapshot/listAvailable/listModels/listModes/listFeatures` | 声明、安装实现、本机读取 |
| 发送 | `agent.send(text,{messageId})`，已运行轮次默认行为为 interrupt | 声明、安装实现、模拟映射；未真实发送 |
| 回复与历史 | `agent.timeline.subscribe(handler)` / `timeline.refetch({limit,cursor?,direction?,projection?})` | 声明、安装实现、本机历史读取和实时订阅 ready |

本机只读检查结果：5 个配置方案（均有模型及 thinking，2 个设置 mode）；9 个 Project；3 个可用 Provider。以首个方案的可用 Provider 检查，返回 7 个模型、3 种模式、2 个功能项；7 个模型均提供 thinking 选项。当前项目的工作区筛选返回 1 个条目，projectId 匹配且无后续页。抽样现有 Agent 的历史读取和实时订阅建立通过。数量只反映检查时刻，不可写死到 UI。

daemon 报告 `agentProfiles`、`agentConfigApply`、`creationLifecycle`、`workspaceRequestReceipts`、`agentRequestReceipts` 均启用。Paseo 客户端自身也检查配置方案能力；实现时需依据目标 daemon 的能力和实际读取结果降级，不能只看桌面安装版本。

### 配置方案与模型映射

配置方案属于 daemon 配置，并非 Buddy 自己的收藏。创建请求没有需要直接透传的 `profileId`；Node 应按方案 ID 解析当前方案，再复制其配置字段。高层 SDK 的 `config.provider` 必须是 `provider/model`，SDK 会拆为 wire 层的独立 `provider` 和 `model`。不能将截图里的显示名当作模型 ID，也不能把方案只当成模型名称而丢失 mode、thinking 和 featureValues。

`model` 在方案中允许缺省；这种情况需要依据 Provider 返回的可用模型及默认项解析，不能拼出 `provider/undefined`。模型列表支持 `id/label/isSelectable/isDefault/thinkingOptions/defaultThinkingOptionId`，Provider 快照提供启用/可用状态、modes 和 defaultModeId。`listFeatures` 的草稿除 `provider/model` 外还必须带 `cwd`。失效方案或不可用模型要明确提示重新选择。

`config.get()` 同时可能返回其他敏感配置。仅在 Node 内处理原始结果，向原生 UI 发送经过筛选的方案显示信息；不转发整份配置、keys、env 或任意 providerOptions。

### 新工作区与自动命名

`WorkspaceCreateRequestSchema` 的 `title` 可省略，`source` 有两种官方形式：

```ts
// 在所选 Project 的现有目录中新建工作区记录，不复制目录。
{ kind: "directory", projectId, path: projectRootPath }

// 创建隔离的 Git worktree；仅适用于支持该操作的 Git Project。
{ kind: "worktree", projectId }
```

不要用 `workspaces.open()` 代替新建：它可复用已有目录对应的工作区，而 `workspace.create` 的语义是新建记录。Paseo 桌面客户端按 isolation 选择上述 source，未设置时默认 `local`。当前原型没有隔离选择，首版建议沿用 `local` 语义；不能假定 Buddy 已能读取桌面客户端保存的 isolation 偏好。

自动命名依据首条消息上下文。安装版 `server/server/session.js` 的 `handleWorkspaceCreateLocal` 以 `firstAgentContext` 生成临时标题并调用 `WorkspaceAutoName.scheduleForDirectory`；worktree 路径通过 `worktree-session.js` 调用 `scheduleForWorktree`。命名是后台操作，模型生成失败时可能保留临时/回退名称，不保证创建响应立即返回最终名称。

建议创建顺序：

1. 新建工作区时传 `firstAgentContext: {prompt: firstMessage}`，不传 `title/branchName/worktreeSlug`。此字段是命名上下文，不等于发送 Agent 消息。
2. 使用返回的工作区对象调用 `.agents.create()`，创建时不带 prompt；已有工作区直接从本步开始。该方法会从权威工作区快照解析 cwd，并显式绑定 workspaceId。
3. 建立 timeline 订阅并等待 `ready` 后，以固定 `messageId` 发送首条消息。名称和状态后续跟随工作区更新。

服务端同样支持在 `workspaces.create` 的 `agent` 参数中一次创建并发送；此时命名上下文取自 `agent.initialPrompt`。高层 SDK 返回工作区 handle，初始 Agent 身份需通过 creation 回调等途径取得；不能假设存在 `workspace.agent` 属性。这条路径需要特别处理订阅建立前的历史，首版推荐上面的分步流程。

### 去重与断线恢复

创建使用稳定 `idempotencyKey`。安装版 `CreationService` 会持久化创建阶段和资源身份，拒绝同一 key 对应不同请求；无法判断是否完成时返回 outcome unknown，不能换 key 盲目重建。

发送 `messageId` 在安装版确实进入 `MessageReceipts`：同一 Agent、同一 messageId、相同内容在 completed 时不会重发；内容变化会冲突；pending 时报告 `agent_request_outcome_unknown`。因此存在正式去重机制，但不代表可以无限自动重试。超时/断线仍需核对历史并保持身份和内容不变。

timeline 订阅是实时流，不会自动回补历史。历史响应包含 `epoch/reset/staleCursor/gap/window/startCursor/endCursor/hasOlder/hasNewer/entries`；恢复时依据这些已声明字段重新校准，并处理 replacement/subscription_restored。关闭弹窗不取消任务；创建后发送失败应保留工作区与 Agent，不自动删除或重新创建。

本轮没有创建工作区/Agent、调用模型发送消息、写配置或修改未读状态。自动命名最终效果、真实创建后的 setup、发送超时恢复及端到端消息流仍需后续受控验收。

### 可复现检查与实现证据

运行 `npm run runtime:build` 后执行 `node scripts/check-quick-chat-api.mjs`。脚本只读连接所选 Paseo home 的 loopback daemon，输出聚合数量、能力标志及字段名，不输出方案名称、目录、消息、凭据或完整错误。`--contracts-only` 仅在注入客户端中验证新建参数、省略名称、工作区绑定、方案字段及 messageId 映射，不连接 daemon。

安装包证据位于 `Contents/Resources/app.asar` 内：`@getpaseo/client/dist/index.js`、`@getpaseo/client/dist/creation/index.js`、`@getpaseo/protocol/dist/agent-profile.js`、`@getpaseo/protocol/dist/messages.js`、`@getpaseo/server/dist/server/server/session.js`、`workspace-auto-name.js`、`worktree-session.js`、`message-receipts/index.js` 和 `creation/index.js`。桌面 source 选择及方案映射还对照了 `Contents/Resources/app-dist/_expo/static/js/web/index-*.js`。读取安装包证据未修改其文件。

## 实现边界

- `server/native-source.ts`（已实现）：独立加号与列表入口、输入区、消息视图、Project/工作区与方案/Provider/模型选择、键盘操作和布局。原生进程不直接接触 Paseo 凭据。
- `shared/quick-chat.ts`（已实现）：定义受限的选项、创建、发送、恢复请求，以及会话、消息和错误协议；严格校验类型、长度与身份。
- `server/quick-chat.ts`、`server/quick-chat-connection.ts`（已实现）：持有本机会话连接，解析有效工作区和模型，执行 SDK 操作、订阅回复、恢复近期历史。
- `server/native-actions.ts`、`server/desktop-companion.ts`：扩展现有管道及生命周期管理。仅允许预定义动作，不允许任意 SDK 方法、端点或 shell。工作区路径由 Node 解析，原生侧只提交选项标识。

已为聊天命令设置独立的 96 KiB 行限制，同时保留 mark-read 的 2 KiB 限制。结果与按会话合并的消息快照分别排队；聊天队列上限 1 MiB，溢出明确发送 `resync_required`，由后续原生 UI 重新请求选项和 resume。关闭面板不等于取消后台任务；插件禁用时释放观察和连接，不默认取消已在 Paseo 创建的任务。服务最多保留 16 个内存会话；消息视图是有界的近期窗口，较旧历史和进程重启后的恢复留待后续。

## 状态与恢复

界面区分：加载配置、可编辑、创建中、发送中、回复中、等待授权、已完成、离线、发送结果待确认和失败。

- 同一草稿提交只允许一个创建操作，创建重试保持同一幂等键；连续点击不会重复创建。
- 发送超时或断线可能意味着服务端已接收。保留提交身份，先核对历史；未确认前不自动重发，不把本地超时当作服务端失败。
- 重连后校准会话状态和消息历史，依据实际协议提供的消息身份与顺序去重；不假定未验证的事件字段。
- 快速对话创建的 agent 仍由现有目录观察器统计。聊天渲染不额外产生完成通知，也不修改现有未读语义。
- 流式刷新保留输入焦点、选区和滚动位置；用户阅读历史时不强制滚到底部。

## 实施顺序与验收

1. 已完成安装版本协议核实、Node 侧创建/订阅/发送/近期历史恢复适配、模拟客户端测试及受限 IPC。
2. 已接入原生按钮与创建表单、消息流/连续对话、权限提示、关闭后恢复、明确重试和官方会话跳转；真实 SDK 写操作仍未作为本轮自动验收执行。
3. 下一步在选定的测试 Project/配置方案下验收真实创建、自动命名、发送、权限等待、断线恢复及 GUI 焦点/输入法，再准备匹配版本的原生 Release。
4. 运行 `npm run check` 和 `npm run native:check`；原生源码变化需发布匹配的新 companion 版本及二进制，不能继续复用旧发布缓存。

验收至少覆盖：重复点击只创建一次；创建后发送失败仍使用原会话；发送结果未知不自动重发；回复在订阅建立前后到达均可恢复；重连和 epoch 替换不漏消息、不重复；权限等待不计入运行数；聊天与观察器不会重复通知；关闭弹窗后任务继续；中文输入、Tab、Escape、Cmd+Enter 可用；多显示器和缩放下不遮挡悬浮条；后台回复不抢焦点。

自动化测试使用注入客户端验证状态转换、快照、恢复、请求去重、通知去重和有界 IPC。真实创建/发送会执行任务，留作明确选择工作区、模型和测试内容后的人工验收。
