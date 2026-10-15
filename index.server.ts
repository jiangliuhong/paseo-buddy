import type { PluginServerContext } from "@getpaseo/plugin/server";
import { agentsSnapshotRpc } from "./shared/agents.js";
import { startDesktopCompanion } from "./server/desktop-companion.js";
import { displaySettings } from "./shared/display-settings.js";
import { createDisplayMirror } from "./server/display-settings.js";
import { companionControlRpc } from "./shared/companion.js";
import { createCompanionControl } from "./server/companion-control.js";
import { AgentState } from "./server/agent-state.js";
import { agentDirectoryQuery, collectAgentSnapshot } from "./server/agent-snapshot.js";

/** Read-only snapshots plus lifecycle-owned startup of the verified desktop companion. */
export default function contribute(server: PluginServerContext, dependencies = { startCompanion: startDesktopCompanion }) {
  server.handle(agentsSnapshotRpc, async (_input, { paseo }) => {
    const state = new AgentState();
    const list = (cursor?: string) => paseo.agents.list({ ...agentDirectoryQuery, page: { limit: 100, cursor } });
    const agents = await collectAgentSnapshot(await list(), cursor => list(cursor));
    state.replaceEntries(agents);
    return { agents: state.snapshot() };
  });
  const settings = server.registerSettings(displaySettings);
  const mirror = createDisplayMirror(settings);
  const companion = createCompanionControl({ displayFile: mirror.file, displayReady: mirror.ready }, dependencies.startCompanion);
  server.handle(companionControlRpc, input => companion.handle(input));
  return async () => {
    // Release a pending initial read before waiting for companion startup to abort.
    const results = await Promise.allSettled([
      Promise.resolve().then(() => mirror.stop()),
      Promise.resolve().then(() => companion.stop()),
    ]);
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  };
}
