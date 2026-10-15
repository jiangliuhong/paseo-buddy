import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, release } from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { execCommand, spawnProcess } from "@getpaseo/plugin/server";
import { nativeAssetName, nativeReleaseBase, releaseBytes } from "./native-download.js";
import { runNativeCompiler } from "./native-compiler.js";
import { nativeSource } from "./native-source.js";
import { readPaseoConfig, readPaseoServerId } from "./paseo-connection.js";
import { buildAgentDeepLink } from "@getpaseo/protocol/agent-deep-link";
import { startLiveAgents } from "./live-agents.js";
import type { BuddyNotification, BuddyState } from "../shared/agents.js";
import type { NativeActionResult } from "../shared/native-actions.js";
import { nativeActionBridge } from "./native-actions.js";

export const companionVersion = "0.1.4-native.1";
const nativeRecipe = "appkit-bundle-1";
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>io.github.jiangliuhong.paseobuddy.native</string>
<key>CFBundleName</key><string>Paseo Buddy</string>
<key>CFBundleExecutable</key><string>Paseo Buddy</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.4</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>`;
export const sourceSha256 = createHash("sha256").update(nativeSource).digest("hex");
export const nativeCacheRoot = () => path.join(homedir(), "Library/Caches/Paseo Buddy/native");
export function companionAsset(platform: string, arch: string, systemRelease = release()) {
  // macOS 13 uses Darwin 22. Reject older systems before any tool/cache/process action.
  return platform === "darwin" && ["arm64", "x64"].includes(arch) && Number.parseInt(systemRelease, 10) >= 22
    ? { source: "server/native-source.ts", arch } : null;
}
export function companionEnvironment(env: NodeJS.ProcessEnv, parentPid: number) {
  const result: NodeJS.ProcessEnv = { PASEO_BUDDY_PARENT_PID: String(parentPid) };
  for (const key of ["HOME", "PATH", "TMPDIR", "USER", "LOGNAME", "LANG", "LC_ALL"]) {
    if (env[key] !== undefined) result[key] = env[key];
  }
  result.PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
  return result;
}
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
export function companionDirectory(cacheRoot: string, arch: string) {
  return path.join(cacheRoot, `${companionVersion}-${arch}-${sourceSha256.slice(0, 16)}-${nativeRecipe}`);
}
export type BuildOptions = {
  allowBuild?: boolean;
  allowDownload?: boolean;
  arch: string;
  cacheRoot: string;
  signal: AbortSignal;
  exec?: typeof execCommand;
  fetch?: typeof fetch;
};
async function validate(directory: string, arch: string) {
  const app = path.join(directory, "Paseo Buddy.app");
  const contents = path.join(app, "Contents");
  const executable = path.join(contents, "MacOS/Paseo Buddy");
  const plist = path.join(contents, "Info.plist");
  for (const folder of [app, contents, path.join(contents, "MacOS")]) {
    if (!(await lstat(folder)).isDirectory()) throw new Error("Native app layout must use real directories");
  }
  if (!(await lstat(plist)).isFile() || await readFile(plist, "utf8") !== infoPlist) throw new Error("Native app identity is invalid");
  const markerFile = path.join(directory, "build.json");
  if (!(await lstat(directory)).isDirectory() || !(await lstat(markerFile)).isFile()
      || !(await lstat(executable)).isFile()) throw new Error("Native cache must contain regular files");
  const marker = JSON.parse(await readFile(markerFile, "utf8"));
  if (marker.recipe !== nativeRecipe || marker.version !== companionVersion || marker.arch !== arch || marker.sourceSha256 !== sourceSha256
      || marker.binarySha256 !== digest(await readFile(executable))) throw new Error("Native companion cache does not match this source");
  await access(executable, constants.X_OK);
  return executable;
}
async function provisionCompanion(options: BuildOptions) {
  if (!["arm64", "x64"].includes(options.arch)) throw new Error("Unsupported companion architecture");
  options.signal.throwIfAborted();
  await mkdir(options.cacheRoot, { recursive: true, mode: 0o700 });
  if (!(await lstat(options.cacheRoot)).isDirectory()) throw new Error("Native cache must be a real directory");
  const destination = companionDirectory(options.cacheRoot, options.arch);
  try { return await validate(destination, options.arch); }
  catch { options.signal.throwIfAborted(); }
  if (!options.allowBuild && !options.allowDownload) throw new Error("Download confirmation required: click 下载并启动 to install the native companion");
  // Fail without changing an unknown/corrupt cache. User can remove this one directory and retry.
  try { await lstat(destination); throw new Error(`Remove invalid native cache before retrying: ${destination}`); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  const temporary = await mkdtemp(path.join(options.cacheRoot, ".build-"));
  try {
    if (options.allowDownload) {
      const signal = AbortSignal.any([options.signal, AbortSignal.timeout(120000)]);
      const base = `${nativeReleaseBase}/${nativeAssetName(options.arch)}`;
      const markerBytes = await releaseBytes(`${base}.json`, 8192, signal, options.fetch);
      const marker = JSON.parse(markerBytes.toString("utf8"));
      if (marker.recipe !== nativeRecipe || marker.version !== companionVersion || marker.arch !== options.arch ||
          marker.sourceSha256 !== sourceSha256 || !/^[a-f0-9]{64}$/.test(marker.binarySha256)) {
        throw new Error("Native release does not match this plugin source/version/architecture");
      }
      const binary = await releaseBytes(base, 32 * 1024 * 1024, signal, options.fetch);
      if (digest(binary) !== marker.binarySha256) throw new Error("Native release SHA-256 mismatch");
      const contents = path.join(temporary, "Paseo Buddy.app/Contents");
      await mkdir(path.join(contents, "MacOS"), { recursive: true, mode: 0o700 });
      await writeFile(path.join(contents, "MacOS/Paseo Buddy"), binary, { mode: 0o700 });
      await writeFile(path.join(contents, "Info.plist"), infoPlist, { mode: 0o600 });
      await writeFile(path.join(temporary, "build.json"), markerBytes, { mode: 0o600 });
      await validate(temporary, options.arch);
      options.signal.throwIfAborted();
      try { await rename(temporary, destination); }
      catch (error) {
        if (!(error instanceof Error && "code" in error && ["EEXIST", "ENOTEMPTY"].includes(String(error.code)))) throw error;
      }
      return await validate(destination, options.arch);
    }
    const source = path.join(temporary, "Buddy.swift");
    const contents = path.join(temporary, "Paseo Buddy.app/Contents");
    await mkdir(path.join(contents, "MacOS"), { recursive: true, mode: 0o700 });
    const executable = path.join(contents, "MacOS/Paseo Buddy");
    await writeFile(path.join(contents, "Info.plist"), infoPlist, { mode: 0o600 });
    await writeFile(source, nativeSource, { mode: 0o600 });
    const exec = options.exec ?? execCommand;
    await exec("/usr/bin/xcode-select", ["-p"], { shell: false, signal: options.signal, timeout: 5000, env: companionEnvironment(process.env, process.pid) });
    await (options.exec ?? runNativeCompiler)("/usr/bin/xcrun", ["swiftc", "-O", "-target", `${options.arch === "arm64" ? "arm64" : "x86_64"}-apple-macosx13.0`, "-framework", "AppKit", "-framework", "UserNotifications",
      "-module-cache-path", path.join(temporary, "modules"), "-o", executable, source], {
      shell: false, signal: options.signal, timeout: 180000,
      env: companionEnvironment(process.env, process.pid), maxBuffer: 1024 * 1024,
    });
    options.signal.throwIfAborted();
    const binarySha256 = digest(await readFile(executable));
    await writeFile(path.join(temporary, "build.json"), JSON.stringify({
      recipe: nativeRecipe, version: companionVersion, arch: options.arch, sourceSha256, binarySha256,
    }), { mode: 0o600 });
    await validate(temporary, options.arch);
    await rm(path.join(temporary, "modules"), { recursive: true, force: true });
    options.signal.throwIfAborted();
    try { await rename(temporary, destination); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && ["EEXIST", "ENOTEMPTY"].includes(String(error.code)))) throw error;
      return await validate(destination, options.arch);
    }
    return await validate(destination, options.arch);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
const builds = new Map<string, Promise<string>>();
export async function ensureCompanion(options: BuildOptions) {
  const key = path.resolve(options.cacheRoot) + "/" + options.arch;
  const previous = builds.get(key);
  const task = (async () => { await previous?.catch(() => {}); options.signal.throwIfAborted(); return provisionCompanion(options); })();
  builds.set(key, task);
  try { return await task; }
  finally { if (builds.get(key) === task) builds.delete(key); }
}

/** Keep only the newest state while the native pipe is backpressured. Never send credentials. */
export function nativePublisher(child: ChildProcess) {
  let waiting = false;
  let latest: string | undefined;
  const notifications: string[] = [];
  const responses: string[] = [];
  let stopped = false;
  const send = () => {
    if (stopped || waiting || !child.stdin || child.stdin.destroyed) return;
    while (!waiting && (latest || responses.length || notifications.length)) {
      const value = latest ?? responses.shift() ?? notifications.shift()!;
      latest = undefined;
      waiting = !child.stdin.write(value);
    }
  };
  const drain = () => { waiting = false; send(); };
  child.stdin?.on("drain", drain);
  const error = () => { stopped = true; latest = undefined; notifications.length = 0; responses.length = 0; };
  child.stdin?.on("error", error);
  return {
    publish(state: BuddyState) {
      if (stopped) return;
      const message = JSON.stringify({ connection: state.connection,
        agents: state.agents.slice(0, 5001).map(({ id, projectName, workspaceName, name, status, startedAt, attentionTimestamp }) =>
          ({ id, projectName, workspaceName, name, status, startedAt, attentionTimestamp,
            ...(state.serverId?.trim() && id.trim() ? { conversationUrl: buildAgentDeepLink({ serverId: state.serverId, agentId: id }) } : {}) })),
      }) + "\n";
      latest = state.agents.length <= 5000 && Buffer.byteLength(message) <= 1024 * 1024 ? message : '{"connection":"disconnected","agents":[]}\n';
      send();
    },
    notify(notification: BuddyNotification) {
      if (stopped || notifications.length >= 256 || !/^[a-f0-9]{64}$/.test(notification.id)) return;
      notifications.push(JSON.stringify({ notification: { id: notification.id,
        agentName: notification.agentName.slice(0, 200), outcome: notification.outcome } }) + "\n");
      send();
    },
    actionResult(result: NativeActionResult) {
      if (stopped) return;
      if (responses.length >= 64) responses.shift();
      responses.push(JSON.stringify({ actionResult: { requestId: result.requestId, agentId: result.agentId,
        success: result.success, error: result.error?.slice(0, 160) ?? null } }) + "\n");
      send();
    },
    stop() {
      stopped = true; latest = undefined; notifications.length = 0; responses.length = 0;
      child.stdin?.off("drain", drain);
      // Pending writes can report EPIPE after stop; keep the owned pipe's error handler.
    },
  };
}
export function startDesktopCompanion(options: {
  allowBuild?: boolean;
  allowDownload?: boolean;
  onError?: (message: string) => void;
  onExit?: () => void;
  platform?: string;
  arch?: string;
  systemRelease?: string;
  cacheRoot?: string;
  displayFile?: string;
  preferencesSuite?: string;
  displayReady?: Promise<void>;
  ensure?: typeof ensureCompanion;
  spawn?: typeof spawnProcess;
  observe?: typeof startLiveAgents;
  log?: (message: string) => void;
  readyTimeoutMs?: number;
} = {}) {
  const controller = new AbortController();
  const arch = options.arch ?? process.arch;
  const cacheRoot = options.cacheRoot ?? nativeCacheRoot();
  let child: ChildProcess | undefined;
  let observation: ReturnType<typeof startLiveAgents> | undefined;
  let publisher: ReturnType<typeof nativePublisher> | undefined;
  let actions: ReturnType<typeof nativeActionBridge> | undefined;
  let latestState: BuddyState = { connection: "connecting", agents: [] };
  let childStop: Promise<void> | undefined;
  let phase: "settings" | "build" | "launch" | "observe" = "settings";
  function stopChild() {
    if (childStop) return childStop;
    childStop = new Promise<void>(resolve => {
      if (!child || child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { child?.kill("SIGKILL"); }, 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.kill("SIGTERM");
    });
    return childStop;
  }
  const ready = (async () => {
    if (!companionAsset(options.platform ?? process.platform, arch, options.systemRelease)) return;
    try {
      await Promise.race([options.displayReady ?? Promise.resolve(), new Promise<void>(resolve => {
        controller.signal.addEventListener("abort", () => resolve(), { once: true });
      })]);
      controller.signal.throwIfAborted();
      phase = "build";
      const executable = await (options.ensure ?? ensureCompanion)({ arch, cacheRoot,
        allowBuild: options.allowBuild === true, allowDownload: options.allowDownload === true, signal: controller.signal });
      controller.signal.throwIfAborted();
      phase = "launch";
      child = (options.spawn ?? spawnProcess)(executable, [], {
        shell: false, stdio: ["pipe", "pipe", "ignore"], signal: controller.signal, killSignal: "SIGTERM",
        env: { ...companionEnvironment(process.env, process.pid), PASEO_BUDDY_LOCK_PATH: path.join(cacheRoot, ".window.lock"),
          ...(options.displayFile ? { PASEO_BUDDY_DISPLAY_FILE: options.displayFile } : {}),
          ...(options.preferencesSuite ? { PASEO_BUDDY_PREFERENCES_SUITE: options.preferencesSuite } : {}) },
      });
      child.on("error", () => {}); // AbortError belongs to this owned lifetime.
      child.once("exit", () => {
        publisher?.stop(); void actions?.stop(); void observation?.stop(); options.onExit?.();
      });
      await new Promise<void>((resolve, reject) => {
        let text = "";
        const timer = setTimeout(() => finish(new Error("Native window did not become ready")), options.readyTimeoutMs ?? 10000);
        const data = (chunk: Buffer) => {
          text += chunk.toString();
          if (text === "READY\n") finish();
          else if (text === "ALREADY_RUNNING\n") finish(new Error("Another Buddy is already running with this native cache"));
          else if (text.length > 64) finish(new Error("Invalid native startup response"));
        };
        const exit = () => finish(new Error("Native window exited before readiness"));
        const error = () => finish(new Error("Native companion could not start"));
        const abort = () => finish(new Error("Native startup cancelled"));
        function finish(error?: Error) {
          clearTimeout(timer); child?.stdout?.off("data", data); child?.off("exit", exit); child?.off("error", errorHandler);
          controller.signal.removeEventListener("abort", abort);
          error ? reject(error) : resolve();
        }
        const errorHandler = error;
        child!.stdout?.on("data", data); child!.once("exit", exit); child!.once("error", errorHandler);
        controller.signal.addEventListener("abort", abort, { once: true });
      });
      controller.signal.throwIfAborted();
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Native window exited after readiness");
      phase = "observe";
      publisher = nativePublisher(child);
      actions = nativeActionBridge(child, { state: () => latestState, reply: publisher.actionResult });
      observation = (options.observe ?? startLiveAgents)({ config: () => readPaseoConfig(), serverId: () => readPaseoServerId(),
        publish: state => { latestState = state; publisher?.publish(state); }, notify: publisher.notify });
      (options.log ?? console.log)("Paseo Buddy native AppKit window started.");
    } catch (error) {
      await actions?.stop();
      await stopChild();
      if (!controller.signal.aborted) options.onError?.(error instanceof Error && /confirmation required|invalid native cache|Another Buddy|Native release|Untrusted native release/.test(error.message)
        ? error.message : phase === "build"
          ? options.allowDownload ? "下载失败，请检查 GitHub 连接后重试下载并启动。" : "Native build failed. Check Apple developer tools, available disk space and cache permissions, then review a fresh build confirmation."
          : phase === "launch"
            ? "Native window could not start. Use a local logged-in macOS desktop session and check companion process/cache permissions."
            : "Companion initialization failed. Check Paseo settings and the local daemon connection, then retry.");
    }
  })();
  let stopping: Promise<void> | undefined;
  return { ready, stop() {
    if (stopping) return stopping;
    controller.abort(); publisher?.stop();
    stopping = (async () => {
      await ready;
      await actions?.stop();
      await observation?.stop();
      await stopChild();
    })();
    return stopping;
  } };
}
