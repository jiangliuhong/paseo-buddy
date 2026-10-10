import { lstat, readFile, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { execCommand } from "@getpaseo/plugin/server";

const cacheName = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-(arm64|x64)$/;
function versionParts(version: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null;
  const parts = version.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function olderThan(version: string, current: string) {
  const left = versionParts(version); const right = versionParts(current);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] < right[i];
  }
  return false;
}
async function markedCache(directory: string, version: string, arch: string) {
  try {
    if (!(await lstat(directory)).isDirectory()) return false;
    const markerFile = path.join(directory, "release.json");
    const stat = await lstat(markerFile);
    if (!stat.isFile() || stat.size > 8192) return false;
    const marker = JSON.parse(await readFile(markerFile, "utf8"));
    return marker.version === version && marker.arch === arch && /^[a-f0-9]{64}$/.test(marker.sha256);
  } catch { return false; }
}
async function processCommands(signal?: AbortSignal) {
  const output = await execCommand("/bin/ps", ["-axo", "command="], {
    shell: false, signal, timeout: 5000, maxBuffer: 4 * 1024 * 1024,
  });
  return output.stdout.split(/\r?\n/);
}
function inUse(commands: readonly string[], directory: string) {
  const prefix = directory + path.sep;
  return commands.some(command => command.includes(prefix));
}

/** Removes only marked older caches after the current app is confirmed running. */
export async function pruneOldCompanions(options: {
  cacheRoot: string;
  currentVersion: string;
  arch: string;
  signal?: AbortSignal;
  runningCommands?: typeof processCommands;
}) {
  const removed: string[] = [];
  const { signal, currentVersion, arch } = options;
  if (!versionParts(currentVersion) || !["arm64", "x64"].includes(arch)) return removed;
  signal?.throwIfAborted();
  // Refuse symlinks and unknown folders rather than expanding the deletion scope.
  if (!(await lstat(options.cacheRoot)).isDirectory()) return removed;
  const root = await realpath(options.cacheRoot);
  const current = path.join(root, `${currentVersion}-${arch}`);
  if (!await markedCache(current, currentVersion, arch)) return removed;
  const list = options.runningCommands ?? processCommands;
  let commands: readonly string[];
  try { commands = await list(signal); }
  catch { return removed; } // Process visibility failure must never trigger deletion.
  const currentExecutable = path.join(current, "Paseo Buddy.app/Contents/MacOS/Paseo Buddy");
  const originalExecutable = path.join(options.cacheRoot, `${currentVersion}-${arch}`, "Paseo Buddy.app/Contents/MacOS/Paseo Buddy");
  if (!commands.some(command => [currentExecutable, originalExecutable].some(file => command.trimStart().startsWith(file)))) return removed;

  for (const entry of await readdir(root)) {
    signal?.throwIfAborted();
    const match = cacheName.exec(entry);
    if (!match) continue;
    const version = `${match[1]}.${match[2]}.${match[3]}`;
    if (!olderThan(version, currentVersion)) continue;
    const directory = path.join(root, entry);
    if (!await markedCache(directory, version, match[4])) continue;
    // Recheck immediately before removal: another old standalone app may be open.
    try { commands = await list(signal); }
    catch { return removed; }
    if (!commands.some(command => [currentExecutable, originalExecutable].some(file => command.trimStart().startsWith(file)))) return removed;
    if (inUse(commands, directory) || inUse(commands, path.join(options.cacheRoot, entry))) continue;
    signal?.throwIfAborted();
    await rm(directory, { recursive: true, force: true });
    removed.push(entry);
  }
  return removed;
}
