import { randomUUID } from "node:crypto";
import { createPaseoApi, type PaseoApi } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { readPaseoConfig } from "./paseo-connection.js";

export type QuickChatConnection = {
  api: PaseoApi;
  serverId: string;
  canCreate: boolean;
  hasProfiles: boolean;
  connected(): boolean;
  close(): Promise<void>;
};

/** Owned loopback connection. Raw daemon config and credentials stay in Node. */
export async function connectQuickChat(signal: AbortSignal): Promise<QuickChatConnection> {
  signal.throwIfAborted();
  const driver = new DaemonClient({ ...readPaseoConfig(), clientId: randomUUID(), clientType: "cli",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    connectTimeoutMs: 5000, reconnect: { enabled: false } });
  const api = createPaseoApi(driver);
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    signal.removeEventListener("abort", abort);
    // Close the transport concurrently so a stalled unsubscribe cannot hold shutdown open.
    await Promise.allSettled([api.dispose(), driver.close()]);
  })();
  const abort = () => { void close().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await driver.connect();
    signal.throwIfAborted();
    const info = driver.getLastServerInfoMessage();
    if (!info?.serverId) throw new Error("Missing daemon identity");
    return { api, serverId: info.serverId, canCreate: info.features?.creationLifecycle === true,
      hasProfiles: info.features?.agentProfiles === true,
      connected: () => !signal.aborted && driver.getConnectionState().status === "connected", close };
  } catch (error) { await close().catch(() => {}); throw error; }
}
