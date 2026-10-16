import type { ChildProcess } from "node:child_process";
import type { BuddyState } from "../shared/agents.js";
import { agentKey } from "../shared/agents.js";
import { nativeMarkReadSchema, type NativeActionResult, type NativeMarkRead } from "../shared/native-actions.js";
import { markAgentRead } from "./agent-attention.js";
import { quickChatCommandSchema, quickChatLimits, type QuickChatMessage } from "../shared/quick-chat.js";
import type { QuickChatService } from "./quick-chat.js";

/** The owned child can request only validated, bounded actions through the Node adapters. */
export function nativeActionBridge(child: ChildProcess, options: {
  state: () => BuddyState;
  reply: (result: NativeActionResult) => void;
  markRead?: typeof markAgentRead;
  quickChat?: QuickChatService;
  quickChatReply?: (message: QuickChatMessage) => void;
}) {
  let stopped = false;
  let buffer = Buffer.alloc(0);
  let discarding = false;
  const seen = new Set<string>();
  const pending = new Map<string, { controller: AbortController; task: Promise<void> }>();
  const chats = new Set<Promise<void>>();
  function reply(command: NativeMarkRead, success: boolean, error: string | null) {
    if (!stopped) options.reply({ requestId: command.requestId, agentId: command.agentId, success, error });
  }
  function receive(command: NativeMarkRead) {
    if (stopped || seen.has(command.requestId)) return;
    seen.add(command.requestId);
    if (seen.size > 256) seen.delete(seen.values().next().value!);
    const state = options.state();
    const agent = state.agents.find(agent => agentKey(agent) === command.agentId && agent.status === "completed_unread"
      && (!agent.serverId || agent.serverId === state.serverId));
    if (state.connection !== "connected" || !agent || (agent.attentionTimestamp ?? null) !== command.attentionTimestamp) {
      reply(command, false, "This completion changed. Refresh the list and try again."); return;
    }
    if (pending.has(command.agentId) || pending.size >= 8) {
      reply(command, false, "A read operation is in progress. Please try again."); return;
    }
    const controller = new AbortController();
    const task = Promise.resolve().then(async () => {
      if (stopped) return;
      try {
        await (options.markRead ?? markAgentRead)({ agentId: agent.id, attentionTimestamp: command.attentionTimestamp,
          serverId: state.serverId, signal: controller.signal });
        reply(command, true, null);
      } catch { reply(command, false, "Could not mark as read. Refresh the list and try again."); }
      finally { pending.delete(command.agentId); }
    });
    pending.set(command.agentId, { controller, task });
  }
  const data = (chunk: Buffer) => {
    if (stopped) return;
    const lineLimit = options.quickChat ? quickChatLimits.inputBytes : 2048;
    if (chunk.length > (options.quickChat ? quickChatLimits.inputBytes : 8192)) { void stop(); return; }
    if (discarding) {
      const newline = chunk.indexOf(10);
      if (newline < 0) return;
      chunk = chunk.subarray(newline + 1); discarding = false;
    }
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const newline = buffer.indexOf(10);
      if (newline < 0) break;
      const line = buffer.subarray(0, newline); buffer = buffer.subarray(newline + 1);
      if (line.length > lineLimit) continue;
      try {
        const value: unknown = JSON.parse(line.toString("utf8"));
        const chat = options.quickChat && quickChatCommandSchema.safeParse(value);
        if (chat && chat.success && options.quickChatReply) {
          if (chats.size >= 8) {
            options.quickChatReply({ kind: "result", requestId: chat.data.requestId, ok: false, error: "busy" });
          } else {
            const task = Promise.resolve().then(async () => {
              if (stopped) return;
              const result = await options.quickChat!.handle(chat.data);
              if (!stopped) options.quickChatReply?.(result);
            }).catch(() => {
              if (!stopped) options.quickChatReply?.({ kind: "result", requestId: chat.data.requestId, ok: false, error: "failed" });
            }).finally(() => chats.delete(task));
            chats.add(task);
          }
          continue;
        }
        if (line.length > 2048) continue;
        const parsed = nativeMarkReadSchema.safeParse(value);
        if (parsed.success) receive(parsed.data);
      } catch { /* Invalid child output is never an executable command or arbitrary RPC. */ }
    }
    if (buffer.length > lineLimit) { buffer = Buffer.alloc(0); discarding = true; }
  };
  child.stdout?.on("data", data);
  async function stop() {
    stopped = true; buffer = Buffer.alloc(0);
    child.stdout?.off("data", data);
    const tasks = [...pending.values()];
    for (const { controller } of tasks) controller.abort();
    await options.quickChat?.stop();
    await Promise.allSettled([...tasks.map(({ task }) => task), ...chats]);
    pending.clear();
  }
  return { stop, receiveChunk: data };
}
