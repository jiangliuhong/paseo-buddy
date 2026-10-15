import { randomUUID } from "node:crypto";
import { DaemonClient, type DaemonClientConfig } from "@getpaseo/client/internal/daemon-client";
import { normalizeAgent } from "./agent-state.js";
import { readPaseoConfig } from "./paseo-connection.js";

type AttentionClient = Pick<DaemonClient, "connect" | "close" | "fetchAgent" | "clearAgentAttention" | "getLastServerInfoMessage">;
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** Pinned SDK compatibility boundary: the high-level 0.11.1 API has no attention action. */
export async function markAgentRead(options: {
  agentId: string;
  attentionTimestamp: string | null;
  serverId?: string;
  signal: AbortSignal;
  config?: () => ReturnType<typeof readPaseoConfig>;
  createClient?: (config: DaemonClientConfig) => AttentionClient;
  timeoutMs?: number;
}) {
  options.signal.throwIfAborted();
  const client = (options.createClient ?? (config => new DaemonClient(config)))({
    ...(options.config ?? readPaseoConfig)(), clientId: randomUUID(), clientType: "cli",
    logger: silentLogger, connectTimeoutMs: 5000, reconnect: { enabled: false },
  });
  const lifetime = new AbortController();
  const parentAbort = () => lifetime.abort();
  options.signal.addEventListener("abort", parentAbort, { once: true });
  if (options.signal.aborted) lifetime.abort();
  const timer = setTimeout(() => lifetime.abort(), options.timeoutMs ?? 15000);
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => { void client.close().catch(() => {}); reject(new Error("Mark as read cancelled or timed out")); };
    lifetime.signal.addEventListener("abort", abort, { once: true });
    if (lifetime.signal.aborted) abort();
  });
  try {
    await Promise.race([(async () => {
      lifetime.signal.throwIfAborted();
      await client.connect();
      lifetime.signal.throwIfAborted();
      if (options.serverId && client.getLastServerInfoMessage()?.serverId !== options.serverId) throw new Error("Daemon identity changed");
      const current = await client.fetchAgent({ agentId: options.agentId });
      lifetime.signal.throwIfAborted();
      if (!current || normalizeAgent(current.agent)?.status !== "completed_unread"
          || (current.agent.attentionTimestamp ?? null) !== options.attentionTimestamp) throw new Error("Completion changed before marking read");
      await client.clearAgentAttention(options.agentId);
    })(), cancelled]);
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", parentAbort);
    lifetime.signal.removeEventListener("abort", abort);
    lifetime.abort(); // Prevent a late connection/fetch from issuing a write after cancellation.
    await client.close().catch(() => {});
  }
}
