/**
 * Nodus evaluation harness (CLI).
 *
 * Programmatically simulates an MCP client against the local SSE endpoint,
 * runs the shared 10-case suite (eval/suite.ts), and prints per-call:
 *
 *   1. Latency      — round-trip wall-clock time in milliseconds
 *   2. Payload size — exact byte-size of the JSON tool result returned by
 *                     the server (UTF-8)
 *
 * Run with the server already listening:  npm run eval
 */

import { runEvalSuite, type EvalRow, type EvalSummary } from "./suite";

const SERVER_URL = process.env.NODUS_URL ?? "http://localhost:3939/sse";

async function main(): Promise<void> {
  console.log(`Nodus Evaluation Harness`);
  console.log(`Connecting to ${SERVER_URL} ...\n`);

  const rows: Array<{
    "#": number;
    test: string;
    tool: string;
    "latency (ms)": number;
    "payload (bytes)": number;
    status: "PASS" | "FAIL";
  }> = [];
  let summary: EvalSummary | undefined;

  for await (const event of runEvalSuite(SERVER_URL)) {
    if (event.type === "start") {
      console.log(`Registered tools (${event.tools.length}): ${event.tools.join(", ")}`);
      if (event.tools.length !== 4) {
        console.warn("WARNING: Registry Pattern violated — expected the fixed 4-tool surface.");
      }
      console.log(`Tool schema payload (one-time context cost): ${event.schemaBytes} bytes\n`);
    } else if (event.type === "row") {
      const r: EvalRow = event.row;
      rows.push({
        "#": r.index,
        test: r.name,
        tool: r.tool,
        "latency (ms)": r.latencyMs,
        "payload (bytes)": r.payloadBytes,
        status: r.pass ? "PASS" : "FAIL",
      });
    } else {
      summary = event.summary;
    }
  }

  console.table(rows);

  if (summary) {
    console.log("Summary");
    console.log("-------");
    console.log(`Calls:            ${summary.total} (${summary.passed} passed, ${summary.failed} failed)`);
    console.log(`Latency avg:      ${summary.avgLatencyMs} ms`);
    console.log(`Latency p50:      ${summary.p50LatencyMs} ms`);
    console.log(`Latency p95:      ${summary.p95LatencyMs} ms`);
    console.log(`Latency max:      ${summary.maxLatencyMs} ms`);
    console.log(`Payload total:    ${summary.totalPayloadBytes} bytes`);
    console.log(`Payload avg/call: ${summary.avgPayloadBytes} bytes`);

    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error("Harness failed:", err);
  process.exit(1);
});
