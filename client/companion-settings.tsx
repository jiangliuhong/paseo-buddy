import { useEffect, useRef, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import type { RpcOutput } from "@getpaseo/plugin";
import { companionControlRpc } from "../shared/companion.js";

export function CompanionSettings() {
  const control = useRpc(companionControlRpc);
  const [result, setResult] = useState<RpcOutput<typeof companionControlRpc>>();
  const [error, setError] = useState<string>();
  const [statusError, setStatusError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      const revision = generation.current;
      void control({ action: "status" }).then(value => {
        if (live && revision === generation.current) {
          setResult(value);
          setStatusError(undefined);
        }
      }).catch(() => { if (live && revision === generation.current) setStatusError("无法读取 Companion 状态，请检查 Paseo 连接。"); });
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { live = false; clearInterval(timer); };
  }, [control]);
  async function act(action: "download" | "start" | "stop") {
    if (locked.current) return;
    locked.current = true; generation.current++; setBusy(true); setError(undefined);
    try {
      setResult(await control({ action }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试。"); }
    finally { generation.current++; locked.current = false; setBusy(false); }
  }
  const disabled = busy || !result || result.status.state === "unsupported" || result.status.state === "starting";
  return <SettingsSection title="原生悬浮窗口">
    <SettingsCard>
      <SettingsRow label={`状态：${result?.status.state ?? "loading"}`} error={error ?? statusError ?? result?.status.error}
        hint={result?.status.state === "unsupported" ? "需要本机 macOS 13 或更新版本，以及 Apple Silicon 或 Intel 处理器。" : undefined}/>
      <SettingsAction label="下载并启动悬浮窗口"
        hint="从 GitHub Release 下载当前插件版本对应的原生程序，校验后启动。无需安装 Xcode 或本地编译；后续启动复用缓存。"
        actionLabel={result?.status.state === "starting" ? "正在启动…" : "下载并启动"}
        disabled={disabled || result?.status.state === "running"} onPress={() => void act("download")}/>
      <SettingsAction label="启动已下载的悬浮窗口" actionLabel="启动缓存"
        disabled={disabled || result?.status.state === "running"} onPress={() => void act("start")}/>
      <SettingsAction label="停止悬浮窗口" actionLabel="停止" disabled={busy || !result || result.status.state === "unsupported"} onPress={() => void act("stop")}/>
    </SettingsCard>
  </SettingsSection>;
}
