import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const stage = path.join(root, "build/desktop");
for (const file of ["main.cjs", "preload.cjs", "window-bounds.cjs", "window-drag.cjs", "paseo-connection.cjs", "display-settings.cjs", "dist/index.html", "runtime/live-agents.mjs"]) {
  await access(path.join(stage, file));
}
const pkg = JSON.parse(await readFile(path.join(stage, "package.json"), "utf8"));
assert.equal(pkg.main, "main.cjs");
assert.ok(!pkg.dependencies, "The staged app must bundle its runtime dependencies");
const isolated = await mkdtemp(path.join(os.tmpdir(), "paseo-buddy-stage-"));
try {
  const bundle = path.join(isolated, "live-agents.mjs");
  await cp(path.join(stage, "runtime/live-agents.mjs"), bundle);
  const { startLiveAgents } = await import(pathToFileURL(bundle).href);
  assert.equal(typeof startLiveAgents, "function");
  const states = [];
  const monitor = startLiveAgents({ config() { throw new Error("No daemon required for bundle validation"); }, publish: state => states.push(state) });
  await monitor.stop();
  assert.equal(states[0].connection, "connecting");
  console.log("Verified staged desktop assets and runtime loading outside the repository.");
} finally {
  await rm(isolated, { recursive: true, force: true });
}
