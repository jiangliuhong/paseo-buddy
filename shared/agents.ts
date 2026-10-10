import { z } from "zod";
import { defineRpc } from "@getpaseo/plugin";

export const buddyAgentSchema = z.object({
  id: z.string(),
  projectName: z.string(),
  workspaceName: z.string(),
  cwd: z.string(),
  name: z.string(),
  status: z.enum(["running", "waiting_permission", "completed_unread"]),
  turnId: z.string().nullable(),
  startedAt: z.string().nullable(),
});
export type BuddyAgent = z.infer<typeof buddyAgentSchema>;
export type BuddyState = {
  connection: "connecting" | "connected" | "disconnected";
  agents: BuddyAgent[];
};
export const agentsSnapshotRpc = defineRpc({
  name: "agents.snapshot",
  input: z.object({}),
  output: z.object({ agents: z.array(buddyAgentSchema) }),
});
