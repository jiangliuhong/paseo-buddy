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
          setResult(previous => ({ ...value, offer: previous?.offer ?? null }));
          setStatusError(undefined);
        }
      }).catch(() => { if (live && revision === generation.current) setStatusError("无法读取 Companion 状态，请检查 Paseo 连接。"); });
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { live = false; clearInterval(timer); };
  }, [control]);
  async function act(action: "prepare" | "confirm" | "cancel" | "start" | "stop") {
    if (locked.current) return;
    locked.current = true; generation.current++; setBusy(true); setError(undefined);
    const token = result?.offer?.token;
    // Hide the offer immediately; late status responses cannot restore cancelled consent.
    if (action === "cancel" || action === "confirm") setResult(previous => previous ? { ...previous, offer: null } : previous);
    try {
      if (action === "confirm") {
        if (!token) return;
        setResult(await control({ action, token }));
      } else setResult(await control({ action }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试。"); }
    finally { generation.current++; locked.current = false; setBusy(false); }
  }
  const offer = result?.offer;
  const disabled = busy || !result || result.status.state === "unsupported" || result.status.state === "starting";
  return <SettingsSection title="原生悬浮窗口">
    <SettingsCard>
      <SettingsRow label={`状态：${result?.status.state ?? "loading"}`} error={error ?? statusError ?? result?.status.error}
        hint={result?.status.state === "unsupported" ? "需要本机 macOS 13 或更新版本，以及 Apple Silicon 或 Intel 处理器。" : undefined}/>
      {offer ? <>
        <SettingsRow label={`原生 Companion ${offer.version} · macOS ${offer.arch}`}
          hint="确认后使用本机 Apple Swift 工具链编译插件附带的 AppKit 源码，并启动悬浮窗口。不会下载独立程序，不需要管理员权限。取消不会编译或启动；有效缓存会直接复用。源码变更后需要重新确认编译。"/>
        <SettingsRow label="源码来源" hint={offer.source}/>
        <SettingsRow label="源码 SHA-256" hint={offer.sourceSha256}/>
        <SettingsRow label="环境要求" hint={offer.requires}/>
        <SettingsAction label="确认本地编译并启动此版本" actionLabel="Confirm build and start" disabled={disabled} onPress={() => void act("confirm")}/>
        <SettingsAction label="取消编译" actionLabel="Cancel" disabled={busy} onPress={() => void act("cancel")}/>
      </> : <>
        <SettingsAction label="Build and start native companion" hint="先查看版本、源码和环境要求，再单独确认本地编译。需要 Apple Command Line Tools；不会自动安装开发工具。"
          actionLabel="Build and start native companion" disabled={disabled || result?.status.state === "running"} onPress={() => void act("prepare")}/>
        <SettingsAction label="启动已编译的 Companion" hint="仅使用与当前源码一致的有效缓存，不编译、不下载。" actionLabel="Start cached companion"
          disabled={disabled || result?.status.state === "running"} onPress={() => void act("start")}/>
        <SettingsAction label="停止 Companion" actionLabel="Stop companion" disabled={busy || !result || result.status.state === "unsupported"} onPress={() => void act("stop")}/>
      </>}
    </SettingsCard>
  </SettingsSection>;
}
