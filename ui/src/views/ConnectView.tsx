import { useState } from "react";
import { Check, Copy } from "lucide-react";

const BASE = "http://localhost:3939";

const SNIPPETS: Array<{ title: string; caption: string; code: string }> = [
  {
    title: "Cursor",
    caption:
      "Save as .cursor/mcp.json in your workspace (already generated in this repo). Cursor connects over SSE natively.",
    code: JSON.stringify(
      { mcpServers: { nodus: { url: `${BASE}/sse` } } },
      null,
      2
    ),
  },
  {
    title: "Claude Code",
    caption: "One command — registers the SSE endpoint for the current project.",
    code: `claude mcp add --transport sse nodus ${BASE}/sse`,
  },
  {
    title: "Codex CLI / app",
    caption:
      "Codex speaks the modern streamable HTTP transport, served at /mcp.",
    code: `codex mcp add nodus --url ${BASE}/mcp`,
  },
  {
    title: "Claude Desktop",
    caption:
      "Merge into ~/Library/Application Support/Claude/claude_desktop_config.json (stdio bridge via mcp-remote).",
    code: JSON.stringify(
      {
        mcpServers: {
          nodus: { command: "npx", args: ["-y", "mcp-remote", `${BASE}/sse`] },
        },
      },
      null,
      2
    ),
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copy
        </>
      )}
    </button>
  );
}

export default function ConnectView() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
        Connect a client
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
        Nodus exposes two MCP tools —{" "}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
          query_nodus_state
        </code>{" "}
        and{" "}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
          update_nodus_state
        </code>
        . Every connected surface reads and writes the same SQLite store.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {SNIPPETS.map((s) => (
          <section
            key={s.title}
            className="rounded-xl border border-neutral-800 bg-neutral-900/50"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-neutral-100">
                  {s.title}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">{s.caption}</div>
              </div>
              <CopyButton text={s.code} />
            </div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-neutral-300">
              {s.code}
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}
