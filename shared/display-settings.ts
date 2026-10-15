import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const pillTextSchema = z.string().trim().max(32).regex(/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u, "请使用不超过 32 个字符的单行文本");

export const displaySchema = z.object({
  opacity: z.number().min(0.3).max(1).default(1),
  scale: z.number().min(0.75).max(1.5).default(1),
  showIcon: z.boolean().default(true),
  showText: z.boolean().default(true),
  customText: pillTextSchema.default("Buddy"),
  listMinHeight: z.number().int().min(100).max(600).default(140),
  listMaxHeight: z.number().int().min(100).max(600).default(360),
}).refine(values => values.listMinHeight <= values.listMaxHeight, {
  path: ["listMaxHeight"], message: "最大高度不能小于最小高度",
});
export type DisplaySettings = z.infer<typeof displaySchema>;
export const displaySettings = defineSettings({
  id: "display", scope: "host", version: 1, schema: displaySchema,
});
