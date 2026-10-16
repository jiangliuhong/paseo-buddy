import { z } from "zod";

export const quickChatLimits = {
  inputBytes: 96 * 1024, outputBytes: 256 * 1024, textLength: 16000,
  sessions: 16, messages: 60, historyRows: 100, directory: 500,
} as const;
const id = z.string().min(1).max(256);
const label = z.string().max(160);
const request = { requestId: z.string().uuid() };
export const quickChatSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("profile"), profileId: id }).strict(),
  z.object({ kind: z.literal("model"), providerId: id, modelId: id }).strict(),
]);
const text = z.string().min(1).max(quickChatLimits.textLength).refine(value => !!value.trim());
export const quickChatCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quick_chat_options"), ...request, projectId: id.optional(), providerId: id.optional() }).strict(),
  z.object({ type: z.literal("quick_chat_create"), ...request, draftId: z.string().uuid(), projectId: id,
    workspaceId: id.nullable(), selection: quickChatSelectionSchema, messageId: z.string().uuid(), text }).strict(),
  z.object({ type: z.literal("quick_chat_send"), ...request, sessionId: z.string().uuid(), messageId: z.string().uuid(), text }).strict(),
  z.object({ type: z.literal("quick_chat_resume"), ...request, sessionId: z.string().uuid() }).strict(),
]);
export type QuickChatCommand = z.infer<typeof quickChatCommandSchema>;
export type QuickChatSelection = z.infer<typeof quickChatSelectionSchema>;
export const quickChatErrorSchema = z.enum([
  "unavailable", "unsupported", "invalid_selection", "not_found", "busy", "limit_exceeded",
  "request_conflict", "outcome_unknown", "failed", "stopped",
]);
export type QuickChatError = z.infer<typeof quickChatErrorSchema>;
export const quickChatOptionsSchema = z.object({
  projects: z.array(z.object({ id, name: label }).strict()).max(quickChatLimits.directory),
  workspaces: z.array(z.object({ id, projectId: id, name: label }).strict()).max(quickChatLimits.directory),
  profiles: z.array(z.object({ id, name: label, providerId: id, modelId: id.optional(),
    modeId: id.optional(), thinkingOptionId: id.optional() }).strict()).max(128),
  providers: z.array(z.object({ id, name: label }).strict()).max(64),
  models: z.array(z.object({ id, name: label, isDefault: z.boolean(),
    thinkingOptions: z.array(z.object({ id, name: label }).strict()).max(32),
    defaultThinkingOptionId: id.optional() }).strict()).max(256),
}).strict();
export type QuickChatOptions = z.infer<typeof quickChatOptionsSchema>;
export const quickChatSessionSchema = z.object({
  sessionId: z.string().uuid(), projectId: id, workspaceId: id, agentId: z.string().uuid(),
  workspaceName: label, agentReady: z.boolean(),
  conversationUrl: z.string().max(8192).optional(),
  connection: z.enum(["connected", "disconnected"]),
  status: z.enum(["creating", "syncing", "idle", "running", "waiting_permission", "failed"]),
  delivery: z.enum(["none", "sending", "accepted", "unknown"]),
  epoch: z.string().max(256).nullable(),
  messages: z.array(z.object({ key: z.string().max(600), role: z.enum(["user", "assistant"]),
    text: z.string().max(4096), messageId: id.optional(), truncated: z.boolean() }).strict()).max(quickChatLimits.messages),
  partial: z.boolean(), error: quickChatErrorSchema.nullable(),
}).strict();
export type QuickChatSession = z.infer<typeof quickChatSessionSchema>;
export const quickChatMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("result"), requestId: z.string().uuid(), ok: z.boolean(),
    error: quickChatErrorSchema.nullable(), draftEditable: z.literal(true).optional(),
    options: quickChatOptionsSchema.optional(), session: quickChatSessionSchema.optional() }).strict(),
  z.object({ kind: z.literal("session"), session: quickChatSessionSchema }).strict(),
  z.object({ kind: z.literal("resync_required") }).strict(),
]);
export type QuickChatMessage = z.infer<typeof quickChatMessageSchema>;
export type QuickChatResult = Extract<QuickChatMessage, { kind: "result" }>;
