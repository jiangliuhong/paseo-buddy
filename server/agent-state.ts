import { basename } from "node:path";
import type { PaseoAgent, PaseoAgentUpdate } from "@getpaseo/client";
import type { ProjectPlacementPayload } from "@getpaseo/protocol/messages";
import type { BuddyAgent } from "../shared/agents.js";

type Entry = { agent: PaseoAgent; project?: ProjectPlacementPayload | null };

export function normalizeAgent(agent: PaseoAgent, project?: ProjectPlacementPayload | null): BuddyAgent | null {
  if (agent.archivedAt) return null;
  const completedUnread = (agent.status === "idle" || agent.status === "closed")
    && agent.requiresAttention === true && agent.attentionReason === "finished"
    && agent.pendingPermissions.length === 0;
  if (agent.status !== "running" && !completedUnread) return null;
  return {
    id: agent.id,
    projectName: project?.projectName || basename(agent.cwd) || agent.cwd,
    workspaceName: project?.workspaceName || "—",
    cwd: agent.cwd,
    name: agent.title || agent.provider,
    status: completedUnread ? "completed_unread" : agent.pendingPermissions.length ? "waiting_permission" : "running",
    turnId: agent.activeTurn?.turnId ?? null,
    startedAt: agent.activeTurn?.startedAt ?? null,
  };
}

export class AgentState {
  private agents = new Map<string, Entry>();

  replace(agents: readonly PaseoAgent[]) {
    this.replaceEntries(agents.map(agent => ({ agent })));
  }

  replaceEntries(entries: readonly Entry[]) {
    this.agents.clear();
    for (const entry of entries) this.upsert(entry.agent, entry.project);
  }

  update(update: PaseoAgentUpdate) {
    if (update.kind === "remove") this.agents.delete(update.agentId);
    else {
      const previous = this.agents.get(update.agent.id);
      // Status-only upserts can omit placement. Preserve it only for the same workspace.
      const sameWorkspace = previous?.agent.workspaceId === update.agent.workspaceId
        && previous?.agent.cwd === update.agent.cwd;
      const project = update.project === undefined && sameWorkspace ? previous?.project : update.project;
      this.upsert(update.agent, project);
    }
  }

  private upsert(agent: PaseoAgent, project?: ProjectPlacementPayload | null) {
    if (normalizeAgent(agent, project)) this.agents.set(agent.id, { agent, project });
    else this.agents.delete(agent.id);
  }

  snapshot(): BuddyAgent[] {
    return [...this.agents.values()]
      .map(({ agent, project }) => normalizeAgent(agent, project))
      .filter((agent): agent is BuddyAgent => agent !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
