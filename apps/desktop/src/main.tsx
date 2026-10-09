import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Activity, X, CirclePlay } from "lucide-react";
import "./style.css";

type Placement = { horizontal: "left" | "right"; vertical: "above" | "below" };
declare global {
  interface Window {
    buddy?: { expand: (value: boolean) => Promise<{ placement: Placement }> };
  }
}
type Agent = { id: string; workspace: string; task: string; elapsed: string };
const demoAgents: Agent[] = [
  { id: "1", workspace: "personal-app-platform", task: "Implementing authentication", elapsed: "2m 18s" },
  { id: "2", workspace: "orchard", task: "Building workflow engine", elapsed: "5m 42s" },
  { id: "3", workspace: "pi-hub", task: "Running tests", elapsed: "36s" },
];

function App() {
  const [expanded, setExpanded] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ horizontal: "right", vertical: "below" });
  const [busy, setBusy] = useState(false);
  const agents = demoAgents;

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

  return <main className={`shell ${placement.horizontal} ${placement.vertical}`}>
    <div className="pill">
      <div className="drag" title="Drag to move"><Bot size={22}/></div>
      <div className="separator"/>
      <button className="counter" onClick={toggle} disabled={busy}
        aria-label={expanded ? "Hide running agents" : "Show running agents"} aria-expanded={expanded}>
        <Activity size={21}/><strong>{agents.length}</strong>
      </button>
    </div>
    {expanded && <section className="panel" aria-label="Running agents">
      <header><b>Running Agents</b><button onClick={toggle} disabled={busy} aria-label="Close"><X size={17}/></button></header>
      <p className="subtitle">{agents.length} running · Demo data</p>
      <div className="agents">{agents.map(a => <div className="agent" key={a.id}>
        <CirclePlay size={17} className="running"/>
        <div className="details"><b>{a.workspace}</b><small>{a.task}</small></div>
        <time>{a.elapsed}</time>
      </div>)}</div>
      <footer>Live Paseo integration coming next</footer>
    </section>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
