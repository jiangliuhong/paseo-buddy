import type { PaseoAgentListOptions, PaseoAgentListResult } from "@getpaseo/client";

// Creation order does not move agents between pages when their status/title changes.
export const agentDirectoryQuery = {
  filter: { includeArchived: false },
  sort: [{ key: "created_at", direction: "asc" }],
} satisfies PaseoAgentListOptions;

export const maxDirectoryEntries = 5000;

/** Collect a bounded directory; never expose a partial result as an accurate count. */
export async function collectAgentSnapshot(
  first: PaseoAgentListResult,
  next: (cursor: string) => Promise<PaseoAgentListResult>,
  isCurrent: () => boolean = () => true,
) {
  const entries: PaseoAgentListResult["entries"] = [];
  const cursors = new Set<string>();
  let page = first;
  for (;;) {
    if (!isCurrent()) throw new Error("Agent snapshot superseded");
    entries.push(...page.entries);
    if (entries.length > maxDirectoryEntries) throw new Error("Agent directory exceeds companion limit");
    if (!page.pageInfo.hasMore) return entries;
    const cursor = page.pageInfo.nextCursor;
    if (!cursor || cursors.has(cursor)) throw new Error("Invalid agent page cursor");
    cursors.add(cursor);
    // Also bound empty pages from a malformed or incompatible daemon.
    if (cursors.size > maxDirectoryEntries) throw new Error("Too many agent pages");
    page = await next(cursor);
  }
}
