import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ChildProcess } from "node:child_process";
import { execCommand, spawnProcess } from "@getpaseo/plugin/server";

export const companionVersion = "0.1.2";
const releaseBase = `https://github.com/jiangliuhong/paseo-buddy/releases/download/v${companionVersion}`;
const maxArchiveBytes = 200 * 1024 * 1024;
const bundleId = "io.github.jiangliuhong.paseobuddy";

export function companionAsset(platform: string, arch: string) {
  if (platform !== "darwin" || !["arm64", "x64"].includes(arch)) return null;
  const name = `Paseo-Buddy-${companionVersion}-macOS-${arch}.zip`;
  return { name, url: `${releaseBase}/${name}`, checksums: `${releaseBase}/SHA256SUMS.txt` };
}

export function checksumFor(text: string, name: string) {
  const match = text.split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line.trim()))
    .find(line => line?.[2] === name);
  if (!match) throw new Error("Companion checksum is missing from the release");
  return match[1];
}

async function releaseResponse(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
  if (!response.ok) throw new Error(`Companion release request returned HTTP ${response.status}`);
  const destination = new URL(response.url);
  if (destination.protocol !== "https:" || !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(destination.hostname)) {
    throw new Error("Unexpected companion download destination");
  }
  return response;
}

export async function downloadArchive(url: string, file: string, expected: string, signal: AbortSignal) {
  const response = await releaseResponse(url, signal);
  if (!response.body) throw new Error("Companion archive is empty");
  const length = Number(response.headers.get("content-length"));
  if (length > maxArchiveBytes) throw new Error("Companion archive exceeds the size limit");
  let bytes = 0;
  const hash = createHash("sha256");
  const verify = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > maxArchiveBytes) return callback(new Error("Companion archive exceeds the size limit"));
    hash.update(chunk);
    callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(file, { flags: "wx", mode: 0o600 }), { signal });
  if (hash.digest("hex") !== expected) throw new Error("Companion archive checksum does not match");
}

async function validateApp(directory: string, signal: AbortSignal) {
  const app = path.join(directory, "Paseo Buddy.app");
  const executable = path.join(app, "Contents/MacOS/Paseo Buddy");
  if (!(await lstat(app)).isDirectory() || !(await lstat(executable)).isFile()) throw new Error("Companion app layout is invalid");
  await access(executable, constants.X_OK);
  const info = await execCommand("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", path.join(app, "Contents/Info.plist")], { shell: false, signal });
  if (info.stdout.trim() !== bundleId) throw new Error("Companion bundle identity is invalid");
  await execCommand("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], { shell: false, signal, timeout: 30000 });
  return executable;
}

export async function ensureCompanion(options: {
  arch: string;
  cacheRoot: string;
  signal: AbortSignal;
  download?: typeof downloadArchive;
  checksum?: (url: string, name: string, signal: AbortSignal) => Promise<string>;
  validate?: typeof validateApp;
  extract?: (archive: string, directory: string, signal: AbortSignal) => Promise<void>;
}) {
  const asset = companionAsset("darwin", options.arch);
  if (!asset) throw new Error("Unsupported companion architecture");
  const { signal } = options;
  const validate = options.validate ?? validateApp;
  await mkdir(options.cacheRoot, { recursive: true, mode: 0o700 });
  if (!(await lstat(options.cacheRoot)).isDirectory()) throw new Error("Companion cache must be a real directory");
  const destination = path.join(options.cacheRoot, `${companionVersion}-${options.arch}`);
  try {
    const marker = JSON.parse(await readFile(path.join(destination, "release.json"), "utf8"));
    if (marker.version === companionVersion && marker.arch === options.arch && /^[a-f0-9]{64}$/.test(marker.sha256)) {
      return await validate(destination, signal);
    }
  } catch { signal.throwIfAborted(); }

  const temporary = await mkdtemp(path.join(options.cacheRoot, ".install-"));
  try {
    const checksum = options.checksum ?? (async (url, name, abort) => {
      const response = await releaseResponse(url, abort);
      const text = await response.text();
      if (text.length > 8192) throw new Error("Companion checksum manifest is too large");
      return checksumFor(text, name);
    });
    const sha256 = await checksum(asset.checksums, asset.name, signal);
    const archive = path.join(temporary, "companion.zip");
    await (options.download ?? downloadArchive)(asset.url, archive, sha256, signal);
    const extract = options.extract ?? (async (file, directory, abort) => {
      await execCommand("/usr/bin/ditto", ["-x", "-k", file, directory], { shell: false, signal: abort, timeout: 60000 });
    });
    await extract(archive, temporary, signal);
    await validate(temporary, signal);
    await rm(archive);
    await writeFile(path.join(temporary, "release.json"), JSON.stringify({ version: companionVersion, arch: options.arch, sha256 }), { mode: 0o600 });
    signal.throwIfAborted();
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && ["EEXIST", "ENOTEMPTY"].includes(String(error.code)))) throw error;
      try { return await validate(destination, signal); }
      catch { signal.throwIfAborted(); }
      await rm(destination, { recursive: true, force: true });
      await rename(temporary, destination);
    }
    return await validate(destination, signal);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function companionEnvironment(env: NodeJS.ProcessEnv, parentPid: number) {
  const childEnv: NodeJS.ProcessEnv = { PASEO_BUDDY_PARENT_PID: String(parentPid) };
  for (const key of ["HOME", "PATH", "TMPDIR", "USER", "LOGNAME", "LANG", "LC_ALL", "PASEO_HOME"]) {
    if (env[key] !== undefined) childEnv[key] = env[key];
  }
  return childEnv;
}

export function startDesktopCompanion(options: {
  platform?: string;
  arch?: string;
  cacheRoot?: string;
  displayFile?: string;
  displayReady?: Promise<void>;
  ensure?: typeof ensureCompanion;
  spawn?: typeof spawnProcess;
  retryMs?: number;
  log?: (message: string) => void;
} = {}) {
  const controller = new AbortController();
  let child: ChildProcess | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const log = options.log ?? console.log;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const ready = (async () => {
    if (!companionAsset(platform, arch)) {
      log("Paseo Buddy desktop auto-start is available only on local macOS daemons (arm64/x64).");
      return;
    }
    await Promise.race([
      options.displayReady ?? Promise.resolve(),
      new Promise<void>(resolve => controller.signal.addEventListener("abort", () => resolve(), { once: true })),
    ]);
    if (controller.signal.aborted) return;
    let failures = 0;
    while (!controller.signal.aborted) {
      try {
        log(`Preparing Paseo Buddy desktop ${companionVersion} for ${arch}.`);
        const executable = await (options.ensure ?? ensureCompanion)({
          arch, signal: controller.signal,
          cacheRoot: options.cacheRoot ?? path.join(homedir(), "Library/Caches/Paseo Buddy/companions"),
        });
        controller.signal.throwIfAborted();
        child = (options.spawn ?? spawnProcess)(executable, [], {
          shell: false, stdio: "ignore", signal: controller.signal, killSignal: "SIGTERM",
          env: { ...companionEnvironment(process.env, process.pid), ...(options.displayFile ? { PASEO_BUDDY_DISPLAY_FILE: options.displayFile } : {}) },
        });
        child.on("error", () => { if (!controller.signal.aborted) log("Paseo Buddy desktop could not be launched."); });
        await new Promise<void>((resolve, reject) => { child!.once("spawn", resolve); child!.once("error", reject); });
        child.once("exit", code => { if (!controller.signal.aborted && code) log(`Paseo Buddy desktop exited with code ${code}.`); });
        log("Paseo Buddy desktop started. Disable the plugin to stop it.");
        return;
      } catch {
        if (controller.signal.aborted) return;
        log("Paseo Buddy desktop is not ready; retrying its release download/start shortly.");
        const delay = Math.min((options.retryMs ?? 5000) * 2 ** Math.min(failures++, 4), 60000);
        await new Promise<void>(resolve => { wake = resolve; retry = setTimeout(resolve, delay); });
      }
    }
  })();
  return {
    ready,
    async stop() {
      controller.abort();
      clearTimeout(retry);
      wake?.();
      await ready;
      if (child && child.exitCode === null && child.signalCode === null) {
        await new Promise<void>(resolve => {
          const timeout = setTimeout(() => { child?.kill("SIGKILL"); resolve(); }, 3000);
          child!.once("exit", () => { clearTimeout(timeout); resolve(); });
          child!.kill("SIGTERM");
        });
      }
    },
  };
}
