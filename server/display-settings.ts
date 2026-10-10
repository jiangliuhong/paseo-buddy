import { mkdtempSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PluginSettings } from "@getpaseo/plugin/server";
import { displaySchema } from "../shared/display-settings.js";

/** A private, appearance-only mirror for the lifecycle-owned Electron child. */
export function createDisplayMirror(settings: PluginSettings<typeof displaySchema>, directory = tmpdir()) {
  const root = mkdtempSync(path.join(directory, "paseo-buddy-display-"));
  const file = path.join(root, "display.json");
  let stopped = false;
  let receivedUpdate = false;
  const write = (input: unknown) => {
    if (stopped) return;
    const parsed = displaySchema.safeParse(input);
    if (!parsed.success) return;
    const temporary = path.join(root, "display.tmp");
    writeFileSync(temporary, JSON.stringify(parsed.data), { mode: 0o600 });
    renameSync(temporary, file);
  };
  write({});
  const unsubscribe = settings.subscribe(state => {
    receivedUpdate = true;
    if (state.status === "ready") write(state.values);
  });
  let cancelRead: () => void = () => {};
  const cancelled = new Promise<void>(resolve => { cancelRead = resolve; });
  const ready = Promise.race([
    settings.read().then(state => {
      if (!receivedUpdate && state.status === "ready") write(state.values);
    }).catch(() => { /* Keep safe defaults; a later settings change can recover. */ }),
    cancelled,
  ]);
  return {
    file, ready,
    stop() {
      if (stopped) return;
      stopped = true;
      cancelRead();
      rmSync(root, { recursive: true, force: true });
      return Promise.resolve(unsubscribe());
    },
  };
}
