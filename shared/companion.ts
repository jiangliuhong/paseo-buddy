import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const companionStatusSchema = z.object({
  state: z.enum(["stopped", "starting", "running", "error", "unsupported"]),
  error: z.string().nullable(),
});
export type CompanionStatus = z.infer<typeof companionStatusSchema>;
export const companionControlRpc = defineRpc({
  name: "companion.control",
  input: z.discriminatedUnion("action", [
    z.object({ action: z.literal("status") }),
    z.object({ action: z.literal("prepare") }),
    z.object({ action: z.literal("confirm"), token: z.string() }),
    z.object({ action: z.literal("cancel") }),
    z.object({ action: z.literal("start") }),
    z.object({ action: z.literal("download") }),
    z.object({ action: z.literal("stop") }),
  ]),
  output: z.object({
    status: companionStatusSchema,
    offer: z.object({ token: z.string(), version: z.string(), source: z.string(), arch: z.string(), sourceSha256: z.string(), requires: z.string() }).nullable(),
  }),
});
