import { z } from "zod";

export const nativeMarkReadSchema = z.object({
  type: z.literal("mark_read"),
  requestId: z.string().uuid(),
  agentId: z.string().min(1).max(1024),
  attentionTimestamp: z.string().max(128).nullable().default(null),
}).strict();
export type NativeMarkRead = z.infer<typeof nativeMarkReadSchema>;
export type NativeActionResult = {
  requestId: string;
  agentId: string;
  success: boolean;
  error: string | null;
};
