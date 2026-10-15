import { z } from "zod";
import { defineRpc } from "@getpaseo/plugin";

export const buddyAgentSchema = z.object({
  id: z.string(),
  serverId: z.string().optional(),
  hostLabel: z.string().optional(),
  projectName: z.string(),
  workspaceName: z.string(),
  cwd: z.string(),
  name: z.string(),
  status: z.enum(["running", "waiting_permission", "completed_unread"]),
  turnId: z.string().nullable(),
  startedAt: z.string().nullable(),
  attentionTimestamp: z.string().nullable().optional(),
});
export type BuddyAgent = z.infer<typeof buddyAgentSchema>;
export type BuddyNotification = {
  id: string;
  agentName: string;
  outcome: "completed" | "failed";
};
export type BuddyState = {
  connection: "connecting" | "connected" | "disconnected";
  agents: BuddyAgent[];
  serverId?: string;
  hosts?: { serverId: string; label: string; connection: "connecting" | "connected" | "disconnected" }[];
};

export const agentKey = (agent: Pick<BuddyAgent, "id" | "serverId">) =>
  agent.serverId ? JSON.stringify([agent.serverId, agent.id]) : agent.id;
export const agentsSnapshotRpc = defineRpc({
  name: "agents.snapshot",
  input: z.object({}),
  output: z.object({ agents: z.array(buddyAgentSchema) }),
});
