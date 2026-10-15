import { createHash } from "node:crypto";
import type { RpcInput } from "@getpaseo/plugin";
import type { BuddyState, BuddyNotification } from "../shared/agents.js";
import { hostRelayRpc } from "../shared/host-relay.js";
import { startLiveAgents } from "./live-agents.js";

/** Existing plugin RPC carries normalized state only. No endpoint, token or network listener. */
export function createHostRelay(options: { now?: () => number; leaseMs?: number; observe?: typeof startLiveAgents } = {}) {
  const now = options.now ?? Date.now;
  const observeLocal = options.observe ?? startLiveAgents;
  const leaseMs = options.leaseMs ?? 15000;
  let owner: { session: string; sequence: number; expires: number; hosts: RpcInput<typeof hostRelayRpc>["hosts"] } | undefined;
  const listeners = new Set<() => void>();
  const notifiers = new Set<(notice: BuddyNotification) => void>();
  const seen = new Set<string>();
  let closed = false;
  const retired = new Set<string>();
  const changed = () => { for (const listener of listeners) listener(); };
  const timer = setInterval(() => {
    if (owner && owner.expires <= now()) { owner = undefined; changed(); }
  }, Math.min(1000, leaseMs));
  timer.unref();
  return {
    handle(input: RpcInput<typeof hostRelayRpc>) {
      if (closed || retired.has(input.session)) return { accepted: false };
      if (owner && owner.expires <= now()) owner = undefined;
      if (owner && (owner.session !== input.session || input.sequence <= owner.sequence)) return { accepted: false };
      if (input.release) {
        retired.add(input.session);
        if (retired.size > 128) retired.delete(retired.values().next().value!);
        owner = undefined; changed(); return { accepted: true };
      }
      owner = { session: input.session, sequence: input.sequence, expires: now() + leaseMs, hosts: input.hosts };
      changed();
      for (const notice of input.notices) {
        const host = input.hosts.find(host => host.serverId === notice.serverId);
        if (host?.connection !== "connected") continue;
        const id = createHash("sha256").update(JSON.stringify([notice.serverId, notice.agentId, notice.turnId])).digest("hex");
        if (seen.has(id)) continue;
        seen.add(id);
        if (seen.size > 10000) seen.delete(seen.values().next().value!);
        for (const notify of notifiers) notify({ id, agentName: notice.agentName, outcome: notice.outcome });
      }
      return { accepted: true };
    },
    observe: ((options: Parameters<typeof startLiveAgents>[0]) => {
      let local: BuddyState = { connection: "connecting", agents: [] };
      const emit = () => {
        const localId = local.serverId ?? options.serverId?.();
        const hosts = owner && owner.expires > now() ? owner.hosts.filter(host => host.serverId !== localId) : [];
        const localAgents = local.agents.map(agent => ({ ...agent, ...(localId ? { serverId: localId, hostLabel: "This Mac" } : {}) }));
        const agents = [...localAgents, ...hosts.filter(host => host.connection === "connected").flatMap(host =>
          host.agents.map(agent => ({ ...agent, cwd: "", serverId: host.serverId, hostLabel: host.label })))];
        const summaries = hosts.map(({ serverId, label, connection }) => ({ serverId, label, connection }));
        if (localId) summaries.unshift({ serverId: localId, label: "This Mac", connection: local.connection });
        options.publish({ ...local, ...(localId ? { serverId: localId } : {}), agents: agents.length > 5000 ? [] : agents,
          connection: agents.length > 5000 ? "disconnected" : local.connection === "connected" || hosts.some(host => host.connection === "connected") ? "connected" : local.connection,
          hosts: summaries });
      };
      listeners.add(emit);
      // Native deduplication uses the same host/agent/turn hash for local and relayed notices.
      const notify = (notice: BuddyNotification) => options.notify?.(notice);
      notifiers.add(notify);
      const observation = observeLocal({ ...options, publish: state => { local = state; emit(); } });
      return { done: observation.done, async stop() { listeners.delete(emit); notifiers.delete(notify); await observation.stop(); } };
    }) satisfies typeof startLiveAgents,
    stop() { closed = true; clearInterval(timer); owner = undefined; listeners.clear(); notifiers.clear(); },
  };
}
