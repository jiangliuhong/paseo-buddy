import { randomUUID } from "node:crypto";
import type { RpcInput } from "@getpaseo/plugin";
import { companionControlRpc, type CompanionStatus } from "../shared/companion.js";
import { companionAsset, companionVersion, sourceSha256, startDesktopCompanion } from "./desktop-companion.js";

/** Confirmation is ephemeral, version-specific and consumed before any local compilation. */
export function createCompanionControl(options: Parameters<typeof startDesktopCompanion>[0] = {}, start = startDesktopCompanion) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const supported = !!companionAsset(platform, arch, options.systemRelease);
  let status: CompanionStatus = { state: supported ? "stopped" : "unsupported", error: null };
  let pending: { token: string; expires: number } | undefined;
  let companion: ReturnType<typeof startDesktopCompanion> | undefined;
  let busy: Promise<void> | undefined;
  let stoppingTask: Promise<void> | undefined;
  let operation = 0;
  let stopFailed = false;
  let closed = false;
  function launch(allowBuild: boolean) {
    if (closed || !supported || busy || status.state === "running") return;
    const revision = ++operation;
    status = { state: "starting", error: null };
    try {
      companion = start({
        ...options, allowBuild,
        onExit: () => { if (revision === operation) status = { state: "stopped", error: null }; },
        onError: message => { if (revision === operation) status = { state: allowBuild ? "error" : "stopped", error: message }; },
      });
    } catch {
      companion = undefined;
      status = { state: "error", error: "Companion startup failed; retry from settings." };
      return;
    }
    const current = companion;
    busy = current.ready.then(() => {
      if (revision === operation && status.state === "starting") status = { state: "running", error: null };
    }).catch(() => { if (revision === operation) status = { state: "error", error: "Companion startup failed; retry from settings." }; })
      .finally(() => { if (revision === operation) busy = undefined; });
  }
  function stop(): Promise<void> {
    if (stoppingTask) return stoppingTask;
    pending = undefined;
    operation++;
    const current = companion;
    const startup = busy;
    // Hold the operation lock throughout child termination, including ready resolution.
    status = { state: "starting", error: null };
    stoppingTask = Promise.resolve().then(async () => {
      try {
        await current?.stop(); await startup;
        stopFailed = false;
        companion = undefined;
        status = { state: supported ? "stopped" : "unsupported", error: null };
      } catch {
        stopFailed = true;
        status = { state: "error", error: "Companion could not stop; retry stopping before starting again." };
        throw new Error(status.error!);
      } finally { busy = undefined; stoppingTask = undefined; }
    });
    return stoppingTask;
  }
  // Cached-only activation can never compile or fetch anything.
  launch(false);
  let stopping = false;
  return {
    async handle(input: RpcInput<typeof companionControlRpc>) {
      if (closed) throw new Error("Plugin is disabled");
      if (input.action === "stop") {
        if (stopping) throw new Error("Companion is stopping");
        stopping = true;
        try { await stop(); } finally { stopping = false; }
      } else if (input.action === "cancel") {
        pending = undefined;
      } else if (input.action !== "status") {
        if (!supported) throw new Error("Companion requires a local macOS 13+ arm64/x64 daemon");
        if (busy || stopping || stoppingTask) throw new Error("Companion operation is in progress");
        if (stopFailed) throw new Error("Retry stopping the companion before starting again");
        if (input.action === "prepare") {
          if (status.state === "running") throw new Error("Stop the companion before preparing a build");
          pending = { token: randomUUID(), expires: Date.now() + 5 * 60_000 };
          return { status, offer: { token: pending.token, version: companionVersion,
            source: "server/native-source.ts (Swift/AppKit source bundled with this plugin)", arch, sourceSha256,
            requires: "Apple Command Line Tools or Xcode; macOS 13 or later; no Companion download" } };
        }
        if (input.action === "confirm") {
          if (!pending || pending.token !== input.token || pending.expires < Date.now()) throw new Error("Build confirmation expired or cancelled; review the build details again");
          pending = undefined;
          launch(true);
        } else if (input.action === "start") {
          pending = undefined;
          launch(false);
        }
      }
      return { status, offer: null };
    },
    async stop() { closed = true; await stop(); },
  };
}
