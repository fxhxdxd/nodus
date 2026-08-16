/**
 * Shared evaluation suite for Nodus.
 *
 * Used by two consumers:
 *   - eval/harness.ts        (CLI: prints a table + summary)
 *   - src/server.ts          (GET /api/eval/stream: streams rows as SSE)
 *
 * The runner is an async generator so consumers receive results row-by-row
 * as each tool call completes.
 */

import { performance } from "perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface TestCase {
  name: string;
  tool: "query_nodus_state" | "update_nodus_state";
  args: Record<string, string>;
  /** Substring that must appear in the decoded text payload for a PASS. */
  expect: string;
}

export const SUITE: TestCase[] = [
  {
    name: "Set active task to Refactoring",
    tool: "update_nodus_state",
    args: { domain: "tasks", key: "active_task", value: "Refactoring" },
    expect: '"ok":true',
  },
  {
    name: "Get active task",
    tool: "query_nodus_state",
    args: { domain: "tasks", query: "active_task" },
    expect: "Refactoring",
  },
  {
    name: "Store code snippet (auth middleware)",
    tool: "update_nodus_state",
    args: {
      domain: "snippets",
      key: "auth-middleware",
      value:
        "export function requireAuth(req, res, next) { if (!req.headers.authorization) return res.status(401).end(); next(); }",
    },
    expect: '"ok":true',
  },
  {
    name: "Get code snippet by key",
    tool: "query_nodus_state",
    args: { domain: "snippets", query: "auth-middleware" },
    expect: "requireAuth",
  },
  {
    name: "Store architecture note",
    tool: "update_nodus_state",
    args: {
      domain: "notes",
      key: "transport-decision",
      value:
        "Nodus uses SSE transport so Cursor, Claude Code and Codex can connect remotely at once.",
    },
    expect: '"ok":true',
  },
  {
    name: "List all entries in tasks domain (*)",
    tool: "query_nodus_state",
    args: { domain: "tasks", query: "*" },
    expect: "active_task",
  },
  {
    name: "Substring search notes for 'SSE'",
    tool: "query_nodus_state",
    args: { domain: "notes", query: "SSE" },
    expect: "transport-decision",
  },
  {
    name: "Overwrite active task",
    tool: "update_nodus_state",
    args: { domain: "tasks", key: "active_task", value: "Testing eval harness" },
    expect: '"ok":true',
  },
  {
    name: "Get active task (post-overwrite)",
    tool: "query_nodus_state",
    args: { domain: "tasks", query: "active_task" },
    expect: "Testing eval harness",
  },
  {
    name: "Query a missing key (empty result)",
    tool: "query_nodus_state",
    args: { domain: "tasks", query: "does_not_exist_xyz" },
    expect: '"matches":[]',
  },
];

export interface EvalRow {
  index: number;
  name: string;
  tool: string;
  latencyMs: number;
  payloadBytes: number;
  pass: boolean;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  totalPayloadBytes: number;
  avgPayloadBytes: number;
}

export type EvalEvent =
  | { type: "start"; tools: string[]; schemaBytes: number }
  | { type: "row"; row: EvalRow }
  | { type: "done"; summary: EvalSummary };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

export function summarize(rows: EvalRow[]): EvalSummary {
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const totalPayloadBytes = rows.reduce((a, r) => a + r.payloadBytes, 0);
  const passed = rows.filter((r) => r.pass).length;
  return {
    total: rows.length,
    passed,
    failed: rows.length - passed,
    avgLatencyMs: round2(latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)),
    p50LatencyMs: round2(percentile(latencies, 50)),
    p95LatencyMs: round2(percentile(latencies, 95)),
    maxLatencyMs: round2(latencies[latencies.length - 1] ?? 0),
    totalPayloadBytes,
    avgPayloadBytes: round2(totalPayloadBytes / (rows.length || 1)),
  };
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Extract the concatenated text blocks from a tool result. Validated at
 * runtime rather than cast — the payload crosses the MCP client boundary.
 */
function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
    )
    .map((block) => block.text)
    .join("\n");
}

/**
 * Run the full suite against a Nodus SSE endpoint, yielding events as each
 * call completes. The connection is always closed, even if iteration is
 * abandoned early (generator finally block).
 */
export async function* runEvalSuite(sseUrl: string): AsyncGenerator<EvalEvent> {
  const client = new Client({ name: "nodus-eval-harness", version: "1.0.0" });
  await client.connect(new SSEClientTransport(new URL(sseUrl)));

  try {
    const tools = await client.listTools();
    yield {
      type: "start",
      tools: tools.tools.map((t) => t.name).sort(),
      schemaBytes: Buffer.byteLength(JSON.stringify(tools.tools), "utf8"),
    };

    const rows: EvalRow[] = [];
    for (const [i, tc] of SUITE.entries()) {
      const startedAt = performance.now();
      const result = await client.callTool({ name: tc.tool, arguments: tc.args });
      const latencyMs = performance.now() - startedAt;

      const payloadBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
      const innerText = extractText(result.content);

      const row: EvalRow = {
        index: i + 1,
        name: tc.name,
        tool: tc.tool,
        latencyMs: round2(latencyMs),
        payloadBytes,
        pass: innerText.includes(tc.expect),
      };
      rows.push(row);
      yield { type: "row", row };
    }

    yield { type: "done", summary: summarize(rows) };
  } finally {
    await client.close();
  }
}
