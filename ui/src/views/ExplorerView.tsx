import { Database, HardDrive, Layers, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "../lib/hooks";
import { formatBytes } from "../lib/format";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
      <Icon className="h-5 w-5 text-cyan-400" />
      <div>
        <div className="text-lg font-semibold leading-tight text-neutral-100">
          {value}
        </div>
        <div className="text-[11px] text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default function ExplorerView() {
  const { nodes, stats, loading, error, refresh, removeNode } = useStore();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
            Memory Explorer
          </h1>
          <p className="mt-1.5 text-sm text-neutral-400">
            Everything the connected AI surfaces currently share.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {stats && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <StatCard
            icon={Database}
            label="context nodes"
            value={String(stats.totalNodes)}
          />
          <StatCard icon={Layers} label="domains" value={String(stats.domains)} />
          <StatCard
            icon={HardDrive}
            label="database size"
            value={formatBytes(stats.dbSizeBytes)}
          />
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error} — is the Nodus server running?
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/70 bg-neutral-900/30">
            {nodes.map((n) => (
              <tr key={n.id} className="group hover:bg-neutral-800/40">
                <td className="px-4 py-3">
                  <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 font-mono text-xs text-cyan-300">
                    {n.domain}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-200">
                  {n.key}
                </td>
                <td className="max-w-xs px-4 py-3 text-neutral-300">
                  <div className="truncate" title={n.value}>
                    {n.value}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                  {new Date(n.updated_at).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    onClick={() => void removeNode(n.id)}
                    title="Delete this context node"
                    className="rounded-md p-1.5 text-neutral-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {nodes.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                  No context stored yet. Ask any connected AI to remember
                  something.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
