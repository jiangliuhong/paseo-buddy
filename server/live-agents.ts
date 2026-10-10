import { createPaseoClient, type PaseoClient, type PaseoClientConfig } from "@getpaseo/client";
import { AgentState } from "./agent-state.js";
import type { BuddyState } from "../shared/agents.js";

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** Runs only in the trusted desktop main process; no credentials enter the renderer. */
export function startLiveAgents(options: {
  config: () => PaseoClientConfig;
  publish: (state: BuddyState) => void;
  createClient?: (config: PaseoClientConfig) => PaseoClient;
  retryBaseMs?: number;
  checkIntervalMs?: number;
}) {
  let stopped = false;
  let client: PaseoClient | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
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
          filter: { includeArchived: false },
          subscribe: {},
        });
        if (stopped) break;
        const state = new AgentState();
        let subscriptionFailed = false;
        const emit = () => { if (observing) publish({ connection: "connected", agents: state.snapshot() }); };
        // The SDK delivers the current snapshot and buffers updates before listener attachment.
        directory.subscription.subscribe({
          snapshot(snapshot) {
            if (!observing || stopped) return;
            if (snapshot.pageInfo.hasMore) {
              subscriptionFailed = true; // Never display a partial count as authoritative.
              return;
            }
            state.replaceEntries(snapshot.entries);
            emit();
          },
          update(message) {
            if (!observing || stopped || subscriptionFailed || message.type !== "agent_update") return;
            state.update(message.payload);
            emit();
          },
          error() { subscriptionFailed = true; },
        });
        failures = 0;
        while (!stopped && !subscriptionFailed && client.getConnectionState().status === "connected") {
          await wait(options.checkIntervalMs ?? 1000);
        }
      } catch {
        // SDK errors can include transport details. Publish only a fixed, credential-free state.
      } finally {
        observing = false;
        await client?.close().catch(() => {});
        client = undefined;
      }
      if (!stopped) {
        publish({ connection: "disconnected", agents: [] });
        const delay = Math.min((options.retryBaseMs ?? 1000) * 2 ** failures++, 30000);
        await wait(delay);
      }
    }
  })();

  return {
    done,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      wake?.();
      await client?.close().catch(() => {});
      await done;
    },
  };
}
