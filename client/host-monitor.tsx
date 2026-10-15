import { useEffect } from "react";
import { getPaseoClient, useHosts, type PluginClientContext } from "@getpaseo/plugin/client";
import { hostRelayRpc } from "../shared/host-relay.js";
import { createHostObserver } from "./host-observer.js";

export function registerHostMonitor(client: PluginClientContext) {
  const session = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let sequence = 0;
  let active = true;
  let observer: ReturnType<typeof createHostObserver> | undefined;
  function Monitor() {
    const hosts = useHosts();
    useEffect(() => {
      if (!active) return;
      observer ??= createHostObserver({ getClient: getPaseoClient,
        publish: async (hosts, notices) => {
          if (!active) return false;
          return (await client.rpc(hostRelayRpc, { session, sequence: ++sequence, hosts, notices })).accepted;
        } });
      observer.configure(hosts);
      // Observation belongs to the plugin installation, not the sidebar's visibility.
    }, [hosts]);
    return null;
  }
  const unregister = client.addSidebarFooterItem({ id: "host-monitor", title: "Buddy host monitor", Component: Monitor });
  return () => {
    active = false; observer?.stop(); unregister();
    const releaseSequence = ++sequence;
    // The loader can revoke RPC capability before contribution cleanup runs.
    // A synchronous rejection must not interrupt other plugin cleanup.
    void Promise.resolve().then(() => client.rpc(hostRelayRpc, {
      session, sequence: releaseSequence, hosts: [], notices: [], release: true,
    })).catch(() => {});
  };
}
