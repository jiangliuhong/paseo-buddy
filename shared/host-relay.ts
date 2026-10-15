import { z } from "zod";
import { defineRpc } from "@getpaseo/plugin";
import { buddyAgentSchema } from "./agents.js";

const identity = z.string().min(1).max(256);
const label = z.string().max(200);
export const relayHostSchema = z.object({
  serverId: identity,
  label,
  connection: z.enum(["connecting", "connected", "disconnected"]),
  agents: z.array(buddyAgentSchema.omit({ cwd: true, serverId: true, hostLabel: true }).extend({
    id: identity, projectName: label, workspaceName: label, name: label,
    turnId: identity.nullable(), startedAt: z.string().max(128).nullable(),
    attentionTimestamp: z.string().max(128).nullable().optional(),
  })).max(5000),
});
export type RelayHost = z.infer<typeof relayHostSchema>;
export const relayNoticeSchema = z.object({
  serverId: identity, agentId: identity, turnId: identity,
  agentName: label, outcome: z.enum(["completed", "failed"]),
});
export type RelayNotice = z.infer<typeof relayNoticeSchema>;
export const hostRelayRpc = defineRpc({
  name: "hosts.publish",
  input: z.object({
    session: z.string().min(1).max(128), sequence: z.number().int().nonnegative(),
    hosts: z.array(relayHostSchema).max(64), notices: z.array(relayNoticeSchema).max(64),
    release: z.boolean().optional(),
  }).superRefine((value, ctx) => {
    if (value.hosts.reduce((count, host) => count + host.agents.length, 0) > 5000
      || new Set(value.hosts.map(host => host.serverId)).size !== value.hosts.length) {
      ctx.addIssue({ code: "custom", message: "Invalid host directory" });
    }
  }),
  output: z.object({ accepted: z.boolean() }),
});
