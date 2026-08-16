import { useState } from "react";
import { Activity, BrainCircuit, Database, Plug, Radio } from "lucide-react";
import ConnectView from "./views/ConnectView";
import ExplorerView from "./views/ExplorerView";
import ActivityView from "./views/ActivityView";
import EvalView from "./views/EvalView";
import { useHealth } from "./lib/hooks";

type Tab = "connect" | "explorer" | "activity" | "eval";

const TABS: Array<{ id: Tab; label: string; icon: typeof Plug }> = [
  { id: "connect", label: "Connect", icon: Plug },
  { id: "explorer", label: "Memory Explorer", icon: Database },
  { id: "activity", label: "Activity", icon: Radio },
  { id: "eval", label: "Eval Harness", icon: Activity },
];

function SidebarFooter() {
  const { online, health } = useHealth();
  const clients = health ? health.sessions.sse + health.sessions.http : 0;

  return (
    <div className="mt-auto flex items-center gap-2 px-5 py-4 text-[11px] leading-relaxed text-neutral-600">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          online ? "bg-emerald-400" : "bg-red-500"
        }`}
      />
      {online ? (
        <span>
          {clients > 0 ? `${clients} client${clients === 1 ? "" : "s"} connected` : "online"}{" "}
          · <span className="font-mono text-neutral-500">{window.location.host}</span>
        </span>
      ) : (
        <span>server unreachable</span>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("connect");

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BrainCircuit className="h-6 w-6 text-cyan-400" />
          <div>
            <div className="text-base font-semibold tracking-tight text-neutral-100">
              Nodus
            </div>
            <div className="text-[11px] text-neutral-500">
              shared context brain
            </div>
          </div>
        </div>

        <nav className="mt-2 flex flex-col gap-1 px-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                tab === id
                  ? "bg-cyan-500/10 font-medium text-cyan-300"
                  : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <SidebarFooter />
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-8">
          {tab === "connect" && <ConnectView />}
          {tab === "explorer" && <ExplorerView />}
          {tab === "activity" && <ActivityView />}
          {tab === "eval" && <EvalView />}
        </div>
      </main>
    </div>
  );
}
