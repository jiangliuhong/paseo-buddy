import { createPaseoClient, type PaseoAgentUpdate, type PaseoClient, type PaseoClientConfig } from "@getpaseo/client";
import { AgentState } from "./agent-state.js";
import { agentDirectoryQuery, collectAgentSnapshot, maxDirectoryEntries } from "./agent-snapshot.js";
import type { BuddyNotification, BuddyState } from "../shared/agents.js";
import { observeTurnNotifications } from "./turn-notifications.js";

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** Runs in the plugin Node process; credentials never enter the native child. */
export function startLiveAgents(options: {
  config: () => PaseoClientConfig;
  publish: (state: BuddyState) => void;
  notify?: (notification: BuddyNotification) => void;
  serverId?: () => string | undefined;
  createClient?: (config: PaseoClientConfig) => PaseoClient;
  retryBaseMs?: number;
  checkIntervalMs?: number;
}) {
  let stopped = false;
  let client: PaseoClient | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  let abortAttempt: (() => void) | undefined;
  const notifiedTurns = new Set<string>(); // Survives transport reconnects, never contains credentials.
  const wait = (ms: number) => new Promise<void>(resolve => {
    wake = resolve;
    timer = setTimeout(resolve, ms);
  });
  const publish = (state: BuddyState) => { if (!stopped) options.publish(state); };

  const done = (async () => {
    let failures = 0;
    while (!stopped) {
      publish({ connection: failures ? "disconnected" : "connecting", agents: [] });
      let observing = true;
      const controller = new AbortController();
      abortAttempt = () => controller.abort();
      let unsubscribe: (() => void) | undefined;
      let healthySince: number | undefined;
      let notifications: ReturnType<typeof observeTurnNotifications> | undefined;
      try {
        // Re-read endpoint and credential on every attempt (daemon restarts rotate both).
        client = (options.createClient ?? createPaseoClient)({
          ...options.config(),
          logger: silentLogger,
          connectTimeoutMs: 5000,
          reconnect: { enabled: false },
        });
        await client.connect();
        if (stopped) break;
        const directory = await client.agents.list({
          ...agentDirectoryQuery,
          page: { limit: 100 },
          subscribe: {},
          signal: controller.signal,
        });
        if (stopped) break;
        const currentClient = client;
        const serverId = options.serverId?.();
        let state: AgentState | undefined;
        let subscriptionFailed = false;
        let generation = 0;
        let pending: PaseoAgentUpdate[] = [];
        const current = () => observing && !stopped && !subscriptionFailed
          && currentClient.getConnectionState().status === "connected";
        const emit = () => {
          if (current() && state) {
            healthySince ??= Date.now();
            publish({ connection: "connected", agents: state.snapshot(), ...(serverId ? { serverId } : {}) });
          }
        };
        const fail = () => {
          if (!observing || stopped || subscriptionFailed) return;
          subscriptionFailed = true;
          state = undefined; pending = [];
          controller.abort();
          notifications?.stop();
          publish({ connection: "disconnected", agents: [] });
        };
        if (options.notify) notifications = observeTurnNotifications({ client: currentClient, serverId, seen: notifiedTurns,
          notify: notification => { if (current()) options.notify?.(notification); }, onError: fail });
        // The SDK delivers the current snapshot and buffers updates before listener attachment.
        unsubscribe = directory.subscription.subscribe({
          snapshot(snapshot) {
            if (!current()) return;
            const version = ++generation;
            state = undefined; pending = [];
            publish({ connection: "connecting", agents: [] });
            void collectAgentSnapshot(snapshot, cursor => currentClient.agents.list({
              ...agentDirectoryQuery, page: { limit: 100, cursor }, signal: controller.signal,
            }), () => current() && generation === version).then(entries => {
              if (!current() || generation !== version) return;
              const hydrated = new AgentState();
              hydrated.replaceEntries(entries);
              notifications?.hydrate(entries.map(entry => entry.agent));
              for (const update of pending) { hydrated.update(update); notifications?.update(update); }
              if (hydrated.size > maxDirectoryEntries) { fail(); return; }
              pending = []; state = hydrated;
              emit();
            }).catch(() => { if (generation === version) fail(); });
          },
          update(message) {
            if (!current() || message.type !== "agent_update") return;
            if (!state) {
              if (pending.length >= maxDirectoryEntries) fail();
              else pending.push(message.payload);
              return;
            }
            state.update(message.payload);
            if (state.size > maxDirectoryEntries) { fail(); return; }
            notifications?.update(message.payload);
            emit();
          },
          error: fail,
        });
        while (!stopped && !subscriptionFailed && client.getConnectionState().status === "connected") {
          await wait(options.checkIntervalMs ?? 1000);
        }
      } catch {
        // SDK errors can include transport details. Publish only a fixed, credential-free state.
      } finally {
        observing = false;
        controller.abort();
        notifications?.stop();
        unsubscribe?.();
        await client?.close().catch(() => {});
        client = undefined;
        abortAttempt = undefined;
      }
      if (!stopped) {
        publish({ connection: "disconnected", agents: [] });
        // A connection that immediately loses its subscription must still back off.
        if (healthySince !== undefined && Date.now() - healthySince >= 30000) failures = 0;
        const delay = Math.min((options.retryBaseMs ?? 1000) * 2 ** failures++, 30000);
        await wait(delay);
      }
    }
  })();

  return {
    done,
    async stop() {
      stopped = true;
      abortAttempt?.();
      clearTimeout(timer);
      wake?.();
      await client?.close().catch(() => {});
      await done;
    },
  };
}
