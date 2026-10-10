import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, X, CirclePlay, Clock, CircleCheck } from "lucide-react";
import "./style.css";
import { NameTooltip } from "./name-tooltip";

import type { BuddyAgent, BuddyState } from "../../../shared/agents";

type Placement = { horizontal: "left" | "right"; vertical: "above" | "below" };
declare global {
  interface Window {
    buddy?: {
      expand: (value: boolean) => Promise<{ placement: Placement }>;
      beginDrag: () => Promise<void>;
      endDrag: () => Promise<{ dragged: boolean }>;
      onPlacement: (callback: (placement: Placement) => void) => () => void;
      getAgents: () => Promise<BuddyState>;
      onAgents: (callback: (state: BuddyState) => void) => () => void;
    };
  }
}
function elapsed(startedAt: string | null, now: number) {
  if (!startedAt || !Number.isFinite(Date.parse(startedAt))) return "—";
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function App() {
  const [expanded, setExpanded] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ horizontal: "right", vertical: "below" });
  const gesture = useRef<Promise<void> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<BuddyState>({ connection: "connecting", agents: [] });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const offPlacement = window.buddy?.onPlacement(setPlacement);
    let disposed = false;
    let receivedUpdate = false;
    const unsubscribe = window.buddy?.onAgents(next => {
      receivedUpdate = true;
      if (!disposed) setState(next);
    });
    void window.buddy?.getAgents().then(next => {
      if (!disposed && !receivedUpdate) setState(next);
    }).catch(() => {
      if (!disposed && !receivedUpdate) setState({ connection: "disconnected", agents: [] });
    });
    if (!window.buddy) setState({ connection: "disconnected", agents: [] });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { disposed = true; offPlacement?.(); unsubscribe?.(); clearInterval(timer); };
  }, []);
  const running = state.agents.filter(agent => agent.status === "running");
  const waiting = state.agents.filter(agent => agent.status === "waiting_permission");
  const unread = state.agents.filter(agent => agent.status === "completed_unread");
  const connected = state.connection === "connected";
  const connectionLabel = connected ? `${running.length} running · ${unread.length} completed unread · ${waiting.length} waiting` : state.connection === "connecting" ? "Connecting to Paseo…" : "Paseo disconnected · Retrying…";
  function agentRow(agent: BuddyAgent) {
    return <div className="agent" key={agent.id}>
      {agent.status === "running" ? <CirclePlay size={17} className="running"/> : agent.status === "completed_unread" ? <CircleCheck size={17} className="unread"/> : <Clock size={17} className="waiting"/>}
      <div className="details"><NameTooltip kind="b" text={`${agent.projectName} - ${agent.workspaceName}`}/><NameTooltip kind="small" text={agent.name}/></div>
      <time title={agent.status === "completed_unread" ? "Completed · Unread in Paseo" : agent.status === "running" ? "Running" : "Waiting for permission"}>{agent.status === "completed_unread" ? "Unread" : elapsed(agent.startedAt, now)}</time>
    </div>;
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !expanded;
    try {
      if (window.buddy) {
        const result = await window.buddy.expand(next);
        setPlacement(result.placement);
      }
      setExpanded(next);
    } catch (error) {
      console.error("Failed to resize Paseo Buddy window:", error);
    } finally {
      setBusy(false);
    }
  }

  function beginGesture(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || busy || gesture.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = window.buddy?.beginDrag() ?? Promise.resolve();
    setDragging(true);
  }

  async function endGesture(event: React.PointerEvent<HTMLButtonElement>, cancelled = false) {
    const started = gesture.current;
    if (!started) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    try {
      await started;
      const result = await window.buddy?.endDrag();
      if (!cancelled && !result?.dragged) await toggle();
    } catch (error) {
      console.error("Could not move Paseo Buddy:", error);
    } finally {
      setDragging(false);
    }
  }

  return <main className={`shell ${placement.horizontal} ${placement.vertical}`}>
    <button className={`pill ${connected ? "connected" : "offline"} ${dragging ? "dragging" : ""}`}
      title={connectionLabel} disabled={busy}
      aria-label={`${expanded ? "Hide" : "Show"} agents: ${connectionLabel}`} aria-expanded={expanded}
      onPointerDown={beginGesture} onPointerUp={event => void endGesture(event)}
      onPointerCancel={event => void endGesture(event, true)}
      onLostPointerCapture={event => void endGesture(event, true)}
      onClick={event => { if (event.detail === 0) void toggle(); }}>
      <Activity size={17} strokeWidth={1.8}/>
      <span className="counts" aria-live="polite">
        {(!connected || running.length > 0 || unread.length === 0) && <strong className={connected && running.length > 0 ? "active-count" : ""}>{connected ? running.length : "—"}</strong>}
        {connected && unread.length > 0 && <strong className="unread-count" title={`${unread.length} completed unread in Paseo`}>{unread.length}</strong>}
      </span>
    </button>
    {expanded && <section className="panel" aria-label="Running agents">
      <header><b>Running Agents</b><button onClick={toggle} disabled={busy} aria-label="Close"><X size={17}/></button></header>
      <p className="subtitle" role="status">{connected ? `${running.length} running · ${unread.length} unread · ${waiting.length} waiting` : connectionLabel}</p>
      <div className="agents">
        {running.map(agentRow)}
        {connected && running.length === 0 && <p className="empty">No running agents</p>}
        {unread.length > 0 && <><h2 className="unread-heading">Completed · Unread</h2>{unread.map(agentRow)}</>}
        {waiting.length > 0 && <><h2 className="waiting-heading">Waiting for permission</h2>{waiting.map(agentRow)}</>}
      </div>
      <footer>{connected ? "Live Paseo · Read completed agents in Paseo" : connectionLabel}</footer>
    </section>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
