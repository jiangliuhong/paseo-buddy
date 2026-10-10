import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DisplaySettingsScreen } from "./client/display-settings.js";

export default function contribute(client: PluginClientContext) {
  return client.addSettingsScreen({
    id: "display", title: "悬浮窗口", icon: "SlidersHorizontal", Component: DisplaySettingsScreen,
  });
}
