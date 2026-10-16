import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureCompanion, companionEnvironment, nativePublisher } from '../build/server/desktop-companion.js';
import { quickChatCommandSchema } from '../build/shared/quick-chat.js';

// Isolated native UI preview. No SDK connection, credential read, real task or notification.
if (process.platform !== 'darwin') throw Error('Native preview requires macOS.');
const root = await mkdtemp(path.join(tmpdir(), 'buddy-chat-preview-'));
const controller = new AbortController();
let child;
let publisher;
let stopping;
const timers = new Set();
async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    controller.abort();
    for (const timer of timers) clearTimeout(timer);
    publisher?.stop();
    if (child && child.exitCode === null && child.signalCode === null) {
      const done = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      await done; clearTimeout(timer);
    }
    await rm(root, { recursive: true, force: true });
  })();
  return stopping;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stop(); });
try {
  const executable = await ensureCompanion({ allowBuild: true, arch: process.arch,
    cacheRoot: path.resolve('build/native'), signal: controller.signal });
  await writeFile(path.join(root, 'appearance.json'), JSON.stringify({ opacity: 1, scale: 1,
    showIcon: true, showText: true, customText: '预览 · Buddy' }), { mode: 0o600 });
  child = spawn(executable, [], { shell: false, stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...companionEnvironment(process.env, process.pid), PASEO_BUDDY_LOCK_PATH: path.join(root, 'window.lock'),
      PASEO_BUDDY_DISPLAY_FILE: path.join(root, 'appearance.json'),
      PASEO_BUDDY_PREFERENCES_SUITE: 'io.github.jiangliuhong.paseobuddy.quickchat.preview' } });
  publisher = nativePublisher(child);
  const models = [
    { id: 'gpt-6.1-sol', name: 'GPT-6.1-Sol', isDefault: true, thinkingOptions: [] },
    { id: 'gpt-6-astra', name: 'GPT-6-Astra', isDefault: false, thinkingOptions: [] },
    { id: 'gpt-6-sol', name: 'GPT-6-Sol', isDefault: false, thinkingOptions: [] },
    { id: 'gpt-6-luna', name: 'GPT-6-Luna', isDefault: false, thinkingOptions: [] },
  ];
  const sessions = new Map();
  function result(command, fields) { publisher.quickChat({ kind: 'result', requestId: command.requestId, ok: true, error: null, ...fields }); }
  function handle(command) {
    if (command.type === 'quick_chat_options') {
      result(command, { options: {
        projects: [{ id: 'buddy', name: 'paseo-buddy' }, { id: 'notes', name: '个人笔记' }],
        workspaces: command.projectId ? [{ id: `${command.projectId}-main`, projectId: command.projectId, name: 'main · 主工作区' },
          { id: `${command.projectId}-reconnect`, projectId: command.projectId, name: '修复重连逻辑' }] : [],
        profiles: process.argv.includes('--no-profiles') ? [] : [
          { id: 'plan', name: '(My)方案', providerId: 'codex', modelId: 'GPT-6-Astra', modeId: 'Auto-review', thinkingOptionId: 'Medium' },
          { id: 'code', name: '(My)编码', providerId: 'codex', modelId: 'GPT-6.1-Sol', modeId: 'Auto-review', thinkingOptionId: 'Medium' },
        ],
        providers: [{ id: 'codex', name: 'Codex' }, { id: 'pi', name: 'Pi' }, { id: 'antigravity', name: 'Antigravity' }],
        models: command.providerId ? models : [],
      } });
      return;
    }
    if (command.type === 'quick_chat_resume') {
      const session = sessions.get(command.sessionId);
      if (session) result(command, { session });
      else publisher.quickChat({ kind: 'result', requestId: command.requestId, ok: false, error: 'not_found' });
      return;
    }
    let session = sessions.get(command.type === 'quick_chat_create' ? command.draftId : command.sessionId);
    if (!session && command.type === 'quick_chat_create') {
      session = { sessionId: command.draftId, projectId: command.projectId, workspaceId: command.workspaceId ?? `wks_${'0'.repeat(16)}`,
        agentId: randomUUID(), workspaceName: command.workspaceId ? 'main' : 'Paseo 自动命名（模拟）', agentReady: true,
        connection: 'connected', status: 'idle', delivery: 'accepted', epoch: 'preview', messages: [], partial: false, error: null };
      sessions.set(session.sessionId, session);
    }
    if (!session) return;
    if (!session.messages.some(message => message.messageId === command.messageId)) {
      session.messages.push({ key: `preview:${session.messages.length}`, role: 'user', text: command.text.slice(0, 4096), messageId: command.messageId, truncated: command.text.length > 4096 });
      session.status = 'running';
      const captured = session;
      const timer = setTimeout(() => {
        timers.delete(timer);
        captured.messages.push({ key: `preview:${captured.messages.length}`, role: 'assistant',
          text: '这是隔离预览中的模拟回复，没有连接真实模型，也没有创建 Paseo 任务。\n\n可以继续输入消息，或关闭后重新打开测试恢复效果。', truncated: false });
        captured.messages = captured.messages.slice(-60);
        captured.status = 'idle'; publisher.quickChat({ kind: 'session', session: captured });
      }, 700);
      timers.add(timer);
    }
    result(command, { session }); publisher.quickChat({ kind: 'session', session });
  }
  let buffer = Buffer.alloc(0); let ready = false;
  const readyTimer = setTimeout(() => { process.exitCode = 1; console.error('Native preview did not become ready.'); void stop(); }, 10000);
  child.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 128 * 1024) { void stop(); return; }
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.subarray(0, newline).toString('utf8'); buffer = buffer.subarray(newline + 1);
      if (line === 'READY') {
        ready = true; clearTimeout(readyTimer); publisher.publish({ connection: 'connected', agents: [] });
        console.log('Isolated native preview ready. Replies are simulated; Ctrl-C closes this owned window.');
        continue;
      }
      if (!ready) continue;
      try { const parsed = quickChatCommandSchema.safeParse(JSON.parse(line)); if (parsed.success) handle(parsed.data); }
      catch { /* Invalid child output is not executable. */ }
    }
  });
  await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  clearTimeout(readyTimer);
  if (!ready && !controller.signal.aborted) { process.exitCode = 1; console.error('Native preview exited before readiness; a logged-in macOS GUI session is required.'); }
} finally { await stop(); }
