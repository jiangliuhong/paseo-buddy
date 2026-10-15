import type { ChildProcess } from "node:child_process";
import { spawnProcess } from "@getpaseo/plugin/server";
import type { execCommand } from "@getpaseo/plugin/server";

/** Own a compiler process group so cancelling swiftc also stops its frontend/linker. */
export const runNativeCompiler: typeof execCommand = async (command, args, options) => {
  if (command !== "/usr/bin/xcrun" || args[0] !== "swiftc" || !options?.signal) throw new Error("Invalid native compiler invocation");
  const signal = options.signal;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    let stderr = "";
    let failure: Error | undefined;
    let force: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try { process.kill(-child.pid, signal); } catch { /* Already reaped. */ }
    };
    const stop = (error: Error) => {
      if (finished || failure) return;
      failure = error;
      killGroup("SIGTERM");
      force = setTimeout(() => killGroup("SIGKILL"), 3000);
    };
    const abort = () => stop(new Error("Native compilation cancelled"));
    const timeout = setTimeout(() => stop(new Error("Native compilation timed out")), options.timeout ?? 180000);
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout); clearTimeout(force); signal.removeEventListener("abort", abort);
      // Driver exit is not proof that all children exited. Reap its owned group on failure.
      if (error) killGroup("SIGKILL");
      error ? reject(error) : resolve({ stdout: "", stderr });
    };
    try {
      child = spawnProcess(command, args, { shell: false, detached: true,
        env: options.env, stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (error) { clearTimeout(timeout); reject(error); return; }
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 8192) stderr += chunk.toString().slice(0, 8192 - stderr.length);
    });
    child.once("error", error => finish(error));
    child.once("close", (code, signal) => finish(failure ?? (code === 0 ? undefined : new Error(`Native compiler failed (${code ?? signal}): ${stderr}`))));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
};
