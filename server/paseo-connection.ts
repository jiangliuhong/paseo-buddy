import { readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

/** Existing local credential remains in the plugin's Node process, never in native IPC. */
export function readPaseoConfig(home = process.env.PASEO_HOME || path.join(homedir(), ".paseo")) {
  const lock = JSON.parse(readFileSync(path.join(home, "paseo.pid"), "utf8"));
  if (typeof lock.listen !== "string") throw new Error("Paseo daemon is not listening");
  const url = new URL(lock.listen.startsWith("tcp://") ? lock.listen : `tcp://${lock.listen}`);
  if (url.protocol !== "tcp:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !url.port || url.username || url.password || url.search || url.hash
      || (url.pathname && url.pathname !== "/")) throw new Error("Unsupported local Paseo endpoint");
  const token = readFileSync(path.join(home, "local-credential"), "utf8").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid Paseo local credential");
  return { url: `ws://${url.host}/ws`, authHeader: `Bearer ${token}` };
}

/** Paseo 0.11.2 server/server-id.js: environment override, otherwise $PASEO_HOME/server-id. */
export function readPaseoServerId(home = process.env.PASEO_HOME || path.join(homedir(), ".paseo"), env = process.env): string | undefined {
  try {
    const id = (env.PASEO_SERVER_ID?.trim() || readFileSync(path.join(home, "server-id"), "utf8").trim());
    return id && id.length <= 256 && !/[\x00-\x20\x7f]/.test(id) ? id : undefined;
  } catch { return undefined; } // Missing identity disables navigation, never agent observation.
}
