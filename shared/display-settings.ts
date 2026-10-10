import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const displaySchema = z.object({
  opacity: z.number().min(0.3).max(1).default(1),
  scale: z.number().min(0.75).max(1.5).default(1),
});
export type DisplaySettings = z.infer<typeof displaySchema>;
export const displaySettings = defineSettings({
  id: "display", scope: "host", version: 1, schema: displaySchema,
});
