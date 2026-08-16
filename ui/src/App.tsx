import { useState } from "react";
import { Plug, Database, Activity, BrainCircuit } from "lucide-react";
import ConnectView from "./views/ConnectView";
import ExplorerView from "./views/ExplorerView";
import EvalView from "./views/EvalView";

type Tab = "connect" | "explorer" | "eval";

const TABS: Array<{ id: Tab; label: string; icon: typeof Plug }> = [
  { id: "connect", label: "Connect", icon: Plug },
  { id: "explorer", label: "Memory Explorer", icon: Database },
  { id: "eval", label: "Eval Harness", icon: Activity },
];

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

        <div className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-neutral-600">
          MCP server on{" "}
          <span className="font-mono text-neutral-500">localhost:3939</span>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-8">
          {tab === "connect" && <ConnectView />}
          {tab === "explorer" && <ExplorerView />}
          {tab === "eval" && <EvalView />}
        </div>
      </main>
    </div>
  );
}
