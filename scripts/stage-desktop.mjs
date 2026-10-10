import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const stage = path.join(root, "build/desktop");
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, "runtime"), { recursive: true });
for (const file of ["main.cjs", "preload.cjs", "window-bounds.cjs", "window-drag.cjs", "paseo-connection.cjs", "dist"]) {
  await cp(path.join(root, "apps/desktop", file), path.join(stage, file), { recursive: true });
}
await build({
  entryPoints: [path.join(root, "server/live-agents.ts")],
  outfile: path.join(stage, "runtime/live-agents.mjs"),
  bundle: true, platform: "node", format: "esm", target: "node22", sourcemap: false,
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await writeFile(path.join(stage, "package.json"), JSON.stringify({
  name: "paseo-buddy-desktop", version: pkg.version, private: true,
  description: pkg.description, main: "main.cjs", author: "jiangliuhong", license: "MIT",
}, null, 2) + "\n");
await cp(path.join(root, "LICENSE"), path.join(stage, "LICENSE"));
console.log(`Staged Paseo Buddy ${pkg.version}: bundled runtime and renderer, no external node_modules needed.`);
