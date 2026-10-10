import type { PluginServerContext } from "@getpaseo/plugin/server";
import { agentsSnapshotRpc } from "./shared/agents.js";
import { AgentState } from "./server/agent-state.js";

/** A read-only RPC using the daemon-scoped public SDK supplied by Paseo. */
export default function contribute(server: PluginServerContext) {
  server.handle(agentsSnapshotRpc, async (_input, { paseo }) => {
    const state = new AgentState();
    const agents = [];
    let cursor: string | undefined;
    do {
      const page = await paseo.agents.list({
        filter: { includeArchived: false },
        page: { limit: 100, cursor },
      });
      agents.push(...page.entries);
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor ?? undefined : undefined;
      if (page.pageInfo.hasMore && !cursor) throw new Error("Missing agent page cursor");
    } while (cursor);
    state.replaceEntries(agents);
    return { agents: state.snapshot() };
  });
  return () => {};
}
