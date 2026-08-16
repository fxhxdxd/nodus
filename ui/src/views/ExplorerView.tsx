import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Database,
  Download,
  HardDrive,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { EXPORT_URL, importNodes } from "../lib/api";
import { formatBytes, timeAgo, tryPrettyJson } from "../lib/format";
import { useStore } from "../lib/hooks";
import type { ContextNode } from "../lib/types";

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

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

function CopyValueButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copy value
        </>
      )}
    </button>
  );
}

interface EditorState {
  mode: "add" | "edit";
  domain: string;
  key: string;
  value: string;
}

function EntryModal({
  editor,
  domains,
  onSave,
  onClose,
}: {
  editor: EditorState;
  domains: string[];
  onSave: (domain: string, key: string, value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [domain, setDomain] = useState(editor.domain);
  const [key, setKey] = useState(editor.key);
  const [value, setValue] = useState(editor.value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = editor.mode === "edit";

  const submit = async () => {
    if (!domain.trim() || !key.trim()) {
      setError("Domain and key are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(domain.trim(), key.trim(), value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-cyan-500 disabled:opacity-50";

  return (
    <Modal title={isEdit ? `Edit ${editor.domain}/${editor.key}` : "Add entry"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-400">Domain</span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="tasks"
              list="nodus-domains"
              disabled={isEdit}
              className={inputClass}
            />
            <datalist id="nodus-domains">
              {domains.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-400">Key</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="active_task"
              disabled={isEdit}
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-400">Value</span>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Anything your AI tools should share — plain text or JSON"
            rows={6}
            autoFocus={isEdit}
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
          />
        </label>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function ExplorerView() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [lastDeleted, setLastDeleted] = useState<ContextNode | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filter = useMemo(
    () => ({ q: debouncedSearch, domain: domainFilter }),
    [debouncedSearch, domainFilter]
  );
  const { nodes, stats, domains, loading, error, refresh, saveEntry, removeNode, restore } =
    useStore(filter);

  const handleDelete = async (node: ContextNode) => {
    setExpandedId(null);
    await removeNode(node);
    setLastDeleted(node);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setLastDeleted(null), 8000);
  };

  const handleUndo = async () => {
    if (!lastDeleted) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    await restore(lastDeleted);
    setLastDeleted(null);
  };

  const handleImportFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const rawNodes = Array.isArray(parsed)
        ? parsed
        : (parsed as { nodes?: unknown }).nodes;
      if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
        throw new Error("Expected a JSON export with a non-empty nodes array");
      }
      const entries = rawNodes.map((n) => {
        const item = n as { domain?: unknown; key?: unknown; value?: unknown };
        if (
          typeof item.domain !== "string" ||
          typeof item.key !== "string" ||
          typeof item.value !== "string"
        ) {
          throw new Error("Every entry needs string domain, key, and value fields");
        }
        return { domain: item.domain, key: item.key, value: item.value };
      });
      const count = await importNodes(entries);
      setImportMessage(`Imported ${count} entr${count === 1 ? "y" : "ies"}`);
      setTimeout(() => setImportMessage(null), 4000);
      await refresh();
    } catch (err) {
      setImportMessage(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`
      );
      setTimeout(() => setImportMessage(null), 6000);
    }
  };

  const toolbarButton =
    "flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white";

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
            Memory Explorer
          </h1>
          <p className="mt-1.5 text-sm text-neutral-400">
            Everything the connected AI tools currently share — searchable and
            editable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refresh()} className={toolbarButton} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <a href={EXPORT_URL} download className={toolbarButton} title="Download a JSON backup">
            <Download className="h-4 w-4" /> Export
          </a>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={toolbarButton}
            title="Import a JSON backup"
          >
            <Upload className="h-4 w-4" /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => setEditor({ mode: "add", domain: domainFilter ?? "", key: "", value: "" })}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-cyan-400"
          >
            <Plus className="h-4 w-4" /> Add entry
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <StatCard icon={Database} label="context nodes" value={String(stats.totalNodes)} />
          <StatCard icon={Layers} label="domains" value={String(stats.domains)} />
          <StatCard icon={HardDrive} label="database size" value={formatBytes(stats.dbSizeBytes)} />
        </div>
      )}

      {/* Toolbar: search + domain chips */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keys and values…"
            className="w-64 rounded-lg border border-neutral-700 bg-neutral-950 py-2 pl-9 pr-8 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-cyan-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setDomainFilter(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              domainFilter === null
                ? "bg-cyan-500/15 text-cyan-300"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            }`}
          >
            All
          </button>
          {domains.map((d) => (
            <button
              key={d}
              onClick={() => setDomainFilter(domainFilter === d ? null : d)}
              className={`rounded-full px-3 py-1.5 font-mono text-xs transition-colors ${
                domainFilter === d
                  ? "bg-cyan-500/15 text-cyan-300"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error} — is the Nodus server running?
        </div>
      )}

      {/* Table */}
      <div className="mt-5 overflow-hidden rounded-xl border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium">By</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/70 bg-neutral-900/30">
            {nodes.map((n) => {
              const expanded = expandedId === n.id;
              const pretty = expanded ? tryPrettyJson(n.value) : null;
              return (
                <tr key={n.id} className="group align-top hover:bg-neutral-800/40">
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 font-mono text-xs text-cyan-300">
                      {n.domain}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-200">{n.key}</td>
                  <td className="max-w-xs px-4 py-3 text-neutral-300">
                    <button
                      onClick={() => setExpandedId(expanded ? null : n.id)}
                      className="block w-full text-left"
                      title={expanded ? "Collapse" : "Expand"}
                    >
                      {expanded ? (
                        <div>
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-950 p-3 font-mono text-xs leading-relaxed text-neutral-200">
                            {pretty ?? n.value}
                          </pre>
                          <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <CopyValueButton value={n.value} />
                            {pretty && (
                              <span className="text-[11px] text-neutral-600">shown as formatted JSON</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="truncate">{n.value}</div>
                      )}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {n.updated_by && (
                      <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                        {n.updated_by}
                      </span>
                    )}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500"
                    title={new Date(n.updated_at).toLocaleString()}
                  >
                    {timeAgo(n.updated_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() =>
                          setEditor({ mode: "edit", domain: n.domain, key: n.key, value: n.value })
                        }
                        title="Edit value"
                        className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-700/60 hover:text-neutral-200"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void handleDelete(n)}
                        title="Delete (undo available)"
                        className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {nodes.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                  {debouncedSearch || domainFilter
                    ? "Nothing matches this filter."
                    : "No context stored yet. Ask any connected AI to remember something, or add an entry above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals & toasts */}
      {editor && (
        <EntryModal
          editor={editor}
          domains={domains}
          onSave={saveEntry}
          onClose={() => setEditor(null)}
        />
      )}
      {lastDeleted && (
        <Toast actionLabel="Undo" onAction={() => void handleUndo()}>
          Deleted{" "}
          <span className="font-mono text-xs">
            {lastDeleted.domain}/{lastDeleted.key}
          </span>
        </Toast>
      )}
      {importMessage && <Toast>{importMessage}</Toast>}
    </div>
  );
}
