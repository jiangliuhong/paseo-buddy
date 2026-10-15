import type { PaseoApi, PaseoAgent, PaseoAgentUpdate, PaseoAgentTimelineSubscription } from "@getpaseo/client";
import { AgentState } from "../shared/agent-state.js";
import { agentDirectoryQuery, collectAgentSnapshot, maxDirectoryEntries } from "../shared/agent-snapshot.js";
import type { RelayHost, RelayNotice } from "../shared/host-relay.js";

export type HostSummary = { serverId: string; label: string; status: string };

/** Borrowed APIs belong to Paseo: detach our subscriptions, never close/dispose the connection. */
export function observeHost(options: {
  host: HostSummary; api: PaseoApi; seen: Set<string>;
  publish: (host: RelayHost) => void; notify: (notice: RelayNotice) => void; failed: () => void;
}) {
  let stopped = false;
  let detach: (() => void) | undefined;
  let generation = 0;
  let state: AgentState | undefined;
  let pending: PaseoAgentUpdate[] = [];
  const controller = new AbortController();
  const watches = new Map<string, { agent: PaseoAgent; unsubscribe?: PaseoAgentTimelineSubscription }>();
  const emit = () => {
    if (!stopped && state) options.publish({ serverId: options.host.serverId, label: options.host.label.slice(0, 200), connection: "connected",
      agents: state.snapshot().map(({ cwd: _cwd, serverId: _server, hostLabel: _label, ...agent }) => ({ ...agent,
        name: agent.name.slice(0, 200), projectName: agent.projectName.slice(0, 200), workspaceName: agent.workspaceName.slice(0, 200) })) });
  };
  function remove(id: string) { const watch = watches.get(id); watches.delete(id); watch?.unsubscribe?.(); }
  function stop() {
    stopped = true; controller.abort(); detach?.();
    for (const id of watches.keys()) remove(id);
    state = undefined; pending = [];
  }
  function fail() { if (!stopped) { stop(); options.failed(); } }
  function watch(agent: PaseoAgent) {
    if (stopped) return;
    if (agent.archivedAt) { remove(agent.id); return; }
    const existing = watches.get(agent.id);
    if (existing) { existing.agent = agent; return; }
    if (agent.status !== "running") return;
    if (watches.size >= maxDirectoryEntries) { fail(); return; }
    const entry: { agent: PaseoAgent; unsubscribe?: PaseoAgentTimelineSubscription } = { agent };
    watches.set(agent.id, entry);
    try {
      entry.unsubscribe = options.api.agents.ref(agent).timeline.subscribe(message => {
        if (stopped || watches.get(agent.id) !== entry || message.agentId !== agent.id) return;
        const event = message.event;
        if (event.type === "error") { fail(); return; }
        if ((event.type !== "turn_completed" && event.type !== "turn_failed") || !event.turnId) return;
        const key = JSON.stringify([options.host.serverId, agent.id, event.turnId]);
        if (options.seen.has(key)) return;
        options.seen.add(key);
        if (options.seen.size > 10000) options.seen.delete(options.seen.values().next().value!);
        options.notify({ serverId: options.host.serverId, agentId: agent.id, turnId: event.turnId,
          agentName: (entry.agent.title || entry.agent.provider).slice(0, 200), outcome: event.type === "turn_completed" ? "completed" : "failed" });
      });
      if (stopped) entry.unsubscribe();
      void entry.unsubscribe.ready.catch(fail);
    } catch { fail(); }
  }
  function update(value: PaseoAgentUpdate, target: AgentState) {
    target.update(value);
    if (value.kind === "remove") remove(value.agentId); else watch(value.agent);
  }
  const ready = (async () => {
    await Promise.resolve();
    try {
      const directory = await options.api.agents.list({ ...agentDirectoryQuery, page: { limit: 100 }, subscribe: {}, signal: controller.signal });
      if (stopped) return;
      detach = directory.subscription.subscribe({
        snapshot(snapshot) {
          if (stopped) return;
          const version = ++generation;
          state = undefined; pending = [];
          options.publish({ serverId: options.host.serverId, label: options.host.label.slice(0, 200), connection: "connecting", agents: [] });
          void collectAgentSnapshot(snapshot, cursor => options.api.agents.list({ ...agentDirectoryQuery, page: { limit: 100, cursor }, signal: controller.signal }),
            () => !stopped && version === generation).then(entries => {
            if (stopped || version !== generation) return;
            const hydrated = new AgentState(); hydrated.replaceEntries(entries);
            const ids = new Set(entries.map(entry => entry.agent.id));
            for (const id of watches.keys()) if (!ids.has(id)) remove(id);
            for (const entry of entries) watch(entry.agent);
            for (const value of pending) update(value, hydrated);
            if (stopped) return;
            if (hydrated.size > maxDirectoryEntries) { fail(); return; }
            state = hydrated; pending = []; emit();
          }).catch(() => { if (version === generation) fail(); });
        },
        update(message) {
          if (stopped || message.type !== "agent_update") return;
          if (!state) { if (pending.length >= maxDirectoryEntries) fail(); else pending.push(message.payload); return; }
          update(message.payload, state);
          if (stopped || !state) return;
          if (state.size > maxDirectoryEntries) { fail(); return; }
          emit();
        },
        error: fail,
      });
      if (stopped) detach();
    } catch { fail(); }
  })();
  return { stop, ready };
}

export function createHostObserver(options: {
  getClient: (serverId: string) => PaseoApi;
  publish: (hosts: RelayHost[], notices: RelayNotice[]) => Promise<boolean>;
  intervalMs?: number; now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const seen = new Set<string>();
  const entries = new Map<string, { host: HostSummary; value: RelayHost; watch?: ReturnType<typeof observeHost>; api?: PaseoApi; retryAt: number; failures: number; healthyAt?: number }>();
  let stopped = false;
  let busy = false;
  let tooManyHosts = false;
  let notices: RelayNotice[] = [];
  function configure(hosts: readonly HostSummary[]) {
    if (stopped) return;
    tooManyHosts = hosts.length > 64;
    const supportedHosts = tooManyHosts ? [] : hosts;
    const ids = new Set(supportedHosts.map(host => host.serverId));
    for (const [id, entry] of entries) if (!ids.has(id)) { entry.watch?.stop(); entries.delete(id); }
    for (const host of supportedHosts) {
      const existing = entries.get(host.serverId);
      if (existing) {
        if (existing.host.status !== "online" && host.status === "online") existing.retryAt = 0;
        existing.host = host; existing.value.label = host.label.slice(0, 200);
        if (host.status !== "online") {
          existing.watch?.stop(); existing.watch = undefined; existing.healthyAt = undefined;
          existing.value = { serverId: host.serverId, label: host.label.slice(0, 200), connection: host.status === "connecting" ? "connecting" : "disconnected", agents: [] };
        }
      } else entries.set(host.serverId, { host, value: { serverId: host.serverId, label: host.label.slice(0, 200), connection: "disconnected", agents: [] }, retryAt: 0, failures: 0 });
    }
    void tick();
  }
  async function tick() {
    if (stopped) return;
    for (const entry of entries.values()) {
      if (now() < entry.retryAt) continue;
      const failed = () => {
        entry.watch?.stop(); entry.watch = undefined;
        if (entry.healthyAt !== undefined && now() - entry.healthyAt >= 30000) entry.failures = 0;
        entry.healthyAt = undefined;
        entry.retryAt = now() + Math.min(1000 * 2 ** Math.min(entry.failures++, 5), 30000);
        entry.value = { ...entry.value, connection: "disconnected", agents: [] };
      };
      try {
        const api = options.getClient(entry.host.serverId);
        if (entry.watch && entry.api === api) continue;
        entry.watch?.stop();
        entry.api = api;
        entry.value = { ...entry.value, connection: "connecting", agents: [] };
        entry.watch = observeHost({ host: entry.host, api, seen,
          publish: value => { entry.value = value; if (value.connection === "connected") entry.healthyAt ??= now(); },
          notify: notice => { if (notices.length < 64) notices.push(notice); }, failed });
      } catch { failed(); }
    }
    if (busy) return;
    busy = true;
    const batch = notices.slice();
    let hosts = [...entries.values()].map(entry => entry.value);
    if (tooManyHosts) hosts = [{ serverId: "buddy:host-limit", label: "Host limit exceeded (64)", connection: "disconnected", agents: [] }];
    else if (hosts.reduce((count, host) => count + host.agents.length, 0) > maxDirectoryEntries) {
      hosts = [{ serverId: "buddy:agent-limit", label: "Agent limit exceeded (5000)", connection: "disconnected", agents: [] }];
    }
    try { if (await options.publish(hosts, batch)) notices.splice(0, batch.length); } catch { /* Retry bounded live notices on the next heartbeat. */ }
    finally { busy = false; }
  }
  const timer = setInterval(() => { void tick(); }, options.intervalMs ?? 1000);
  return { configure, tick, stop() { stopped = true; clearInterval(timer); for (const entry of entries.values()) entry.watch?.stop(); entries.clear(); notices = []; } };
}
