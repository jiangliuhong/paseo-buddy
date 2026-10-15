import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DisplaySettingsScreen } from "./client/display-settings.js";
import { registerHostMonitor } from "./client/host-monitor.js";

export default function contribute(client: PluginClientContext) {
  const stopMonitor = registerHostMonitor(client);
  const stopSettings = client.addSettingsScreen({
    id: "display", title: "悬浮窗口", icon: "SlidersHorizontal", Component: DisplaySettingsScreen,
  });
  return () => { stopMonitor(); stopSettings(); };
}
