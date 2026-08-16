import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  MessageSquareText,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useConnections, useHealth } from "../lib/hooks";
import { timeAgo } from "../lib/format";
import type { ActiveSession, ClientSeen } from "../lib/types";

/**
 * All connection URLs derive from the page's own origin, so the
 * instructions are correct wherever this dashboard is served from —
 * any host, any port.
 */
const ORIGIN = window.location.origin;

interface Snippet {
  id: string;
  title: string;
  caption: string;
  code: string;
  /** Matches this card against MCP clientInfo names. */
  matcher: RegExp;
}

const SNIPPETS: Snippet[] = [
  {
    id: "cursor",
    title: "Cursor",
    caption:
      "Save as .cursor/mcp.json in your workspace — Cursor picks it up automatically and asks you to approve the server.",
    code: JSON.stringify({ mcpServers: { nodus: { url: `${ORIGIN}/sse` } } }, null, 2),
    matcher: /cursor/i,
  },
  {
    id: "claude-code",
    title: "Claude Code",
    caption: "One command in your terminal — registers Nodus for the current project.",
    code: `claude mcp add --transport sse nodus ${ORIGIN}/sse`,
    matcher: /claude[\s_-]?code/i,
  },
  {
    id: "codex",
    title: "Codex (CLI or app)",
    caption: "One command — Codex connects over the modern streamable HTTP transport.",
    code: `codex mcp add nodus --url ${ORIGIN}/mcp`,
    matcher: /codex/i,
  },
  {
    id: "claude-desktop",
    title: "Claude Desktop",
    caption:
      "One command, run inside this repo — it finds the app's config on macOS, Windows, or Linux, backs it up, and adds Nodus. Then fully quit and reopen Claude Desktop.",
    code: `npm run connect:claude-desktop -- --url ${ORIGIN}/sse`,
    matcher: /claude|mcp-remote/i,
  },
];

/** First card whose matcher hits, in declaration order (most specific first). */
function matchCard(clientName: string): string | null {
  for (const snippet of SNIPPETS) {
    if (snippet.matcher.test(clientName)) return snippet.id;
  }
  return null;
}

type CardStatus =
  | { kind: "connected" }
  | { kind: "seen"; lastSeen: string }
  | { kind: "waiting" };

function cardStatus(
  id: string,
  sessions: ActiveSession[],
  seen: ClientSeen[]
): CardStatus {
  const activeMatch = sessions.some(
    (s) => s.client && matchCard(s.client.name) === id
  );
  if (activeMatch) return { kind: "connected" };
  const seenMatch = seen.find((c) => matchCard(c.name) === id);
  if (seenMatch) return { kind: "seen", lastSeen: seenMatch.last_seen };
  return { kind: "waiting" };
}

function StatusPill({ status }: { status: CardStatus }) {
  if (status.kind === "connected") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
      </span>
    );
  }
  if (status.kind === "seen") {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full bg-neutral-700/40 px-2.5 py-1 text-xs text-neutral-300"
        title="This client has connected before but has no session open right now"
      >
        <Clock className="h-3.5 w-3.5" /> Last seen {timeAgo(status.lastSeen)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-neutral-800/60 px-2.5 py-1 text-xs text-neutral-500">
      <Circle className="h-3 w-3" /> Not connected yet
    </span>
  );
}

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
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
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

function StatusStrip({ sessions }: { sessions: ActiveSession[] }) {
  const { online } = useHealth();

  if (!online) {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
        <div className="text-sm text-amber-200">
          Can't reach the Nodus server. Start it with{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">
            npm start
          </code>{" "}
          in the project folder, then refresh this page.
        </div>
      </div>
    );
  }

  const names = [
    ...new Set(sessions.filter((s) => s.client).map((s) => s.client!.name)),
  ];

  return (
    <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-900/60 bg-emerald-950/20 px-4 py-3">
      <Wifi className="h-4 w-4 shrink-0 text-emerald-400" />
      <div className="text-sm text-emerald-200">
        Server online at <span className="font-mono text-xs">{ORIGIN}</span>
        {names.length > 0 && (
          <>
            {" "}
            — connected now:{" "}
            <span className="font-medium">{names.join(", ")}</span>
          </>
        )}
      </div>
    </div>
  );
}

function StepHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-semibold text-cyan-300">
        {step}
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
        {title}
      </h2>
    </div>
  );
}

const TRY_IT: Array<{ where: string; prompt: string }> = [
  {
    where: "In one connected tool",
    prompt: 'Save to nodus: the active task is "fixing the login bug".',
  },
  {
    where: "In any other connected tool",
    prompt: "What does nodus say the active task is?",
  },
];

export default function ConnectView() {
  const { sessions, seen } = useConnections();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
        Get started
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
        Nodus gives your AI tools one shared, persistent memory. Connect any of
        them below — the cards check themselves off as each tool connects for
        the first time.
      </p>

      <StatusStrip sessions={sessions} />

      <StepHeading step={1} title="Connect your AI tools" />
      <p className="mt-2 text-sm text-neutral-500">
        Pick the tools you use — each takes under a minute.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {SNIPPETS.map((s) => (
          <section
            key={s.id}
            className="rounded-xl border border-neutral-800 bg-neutral-900/50"
          >
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium text-neutral-100">
                    {s.title}
                  </span>
                  <StatusPill status={cardStatus(s.id, sessions, seen)} />
                </div>
                <div className="mt-1 text-xs text-neutral-500">{s.caption}</div>
              </div>
              <CopyButton text={s.code} />
            </div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-neutral-300">
              {s.code}
            </pre>
          </section>
        ))}
      </div>

      <StepHeading step={2} title="Try the shared memory" />
      <p className="mt-2 text-sm text-neutral-500">
        The whole point is cross-tool recall — write from one tool, read from
        another.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {TRY_IT.map((t) => (
          <div
            key={t.where}
            className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3"
          >
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                {t.where}
              </div>
              <div className="mt-1 text-sm text-neutral-200">“{t.prompt}”</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-neutral-500">
        Every write shows up live in the{" "}
        <span className="text-neutral-300">Activity</span> tab, and the full
        store is browsable in{" "}
        <span className="text-neutral-300">Memory Explorer</span>.
      </p>
    </div>
  );
}
