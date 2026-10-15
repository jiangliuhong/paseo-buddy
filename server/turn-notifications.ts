import { createHash } from "node:crypto";
import type { PaseoAgent, PaseoAgentUpdate, PaseoClient, PaseoAgentTimelineSubscription } from "@getpaseo/client";
import type { BuddyNotification } from "../shared/agents.js";

/** Only live, explicitly identified terminal events can produce notifications. */
export function observeTurnNotifications(options: {
  client: PaseoClient;
  serverId?: string;
  seen: Set<string>;
  notify: (notification: BuddyNotification) => void;
  onError: () => void;
}) {
  const watches = new Map<string, { agent: PaseoAgent; unsubscribe?: PaseoAgentTimelineSubscription }>();
  let stopped = false;
  function remove(id: string) {
    const watch = watches.get(id);
    watches.delete(id);
    watch?.unsubscribe?.();
  }
  function upsert(agent: PaseoAgent) {
    if (stopped) return;
    if (agent.archivedAt) { remove(agent.id); return; }
    const existing = watches.get(agent.id);
    if (existing) { existing.agent = agent; return; }
    if (agent.status !== "running") return;
    if (watches.size >= 5000) { options.onError(); return; }
    const watch: { agent: PaseoAgent; unsubscribe?: PaseoAgentTimelineSubscription } = { agent };
    watches.set(agent.id, watch);
    try {
      watch.unsubscribe = options.client.agents.ref(agent).timeline.subscribe(message => {
        if (stopped || watches.get(agent.id) !== watch || message.agentId !== agent.id) return;
        const event = message.event;
        if (event.type === "error") { options.onError(); return; }
        if (event.type !== "turn_completed" && event.type !== "turn_failed") return;
        // Optional in the official protocol: never fabricate a turn identity from status/time.
        if (!event.turnId) return;
        const id = createHash("sha256").update(JSON.stringify(options.serverId ? [options.serverId, agent.id, event.turnId] : [agent.id, event.turnId])).digest("hex");
        if (options.seen.has(id)) return;
        options.seen.add(id);
        if (options.seen.size > 10000) options.seen.delete(options.seen.values().next().value!);
        options.notify({ id, agentName: (watch.agent.title || watch.agent.provider).slice(0, 200),
          outcome: event.type === "turn_completed" ? "completed" : "failed" });
      });
      if (stopped || watches.get(agent.id) !== watch) watch.unsubscribe();
      void watch.unsubscribe.ready.catch(() => {
        if (!stopped && watches.get(agent.id) === watch) options.onError();
      });
    } catch { options.onError(); }
  }
  return {
    hydrate(agents: readonly PaseoAgent[]) {
      const ids = new Set(agents.map(agent => agent.id));
      for (const id of watches.keys()) if (!ids.has(id)) remove(id);
      for (const agent of agents) upsert(agent);
    },
    update(update: PaseoAgentUpdate) {
      if (update.kind === "remove") remove(update.agentId);
      else upsert(update.agent);
    },
    stop() {
      stopped = true;
      for (const id of watches.keys()) remove(id);
    },
  };
}
