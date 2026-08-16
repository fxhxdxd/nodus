import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Play, XCircle } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EVAL_STREAM_URL } from "../lib/api";
import type { EvalRow, EvalSummary } from "../lib/types";

type RunState = "idle" | "running" | "done" | "error";

export default function EvalView() {
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [state, setState] = useState<RunState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  // Close any live stream when the view unmounts.
  useEffect(() => () => sourceRef.current?.close(), []);

  const run = () => {
    sourceRef.current?.close();
    setRows([]);
    setSummary(null);
    setErrorMsg(null);
    setState("running");

    const source = new EventSource(EVAL_STREAM_URL);
    sourceRef.current = source;

    source.addEventListener("row", (e) => {
      const { row } = JSON.parse((e as MessageEvent).data) as { row: EvalRow };
      setRows((prev) => [...prev, row]);
    });

    source.addEventListener("done", (e) => {
      const { summary } = JSON.parse((e as MessageEvent).data) as {
        summary: EvalSummary;
      };
      setSummary(summary);
      setState("done");
      source.close();
    });

    source.addEventListener("error", (e) => {
      // Server-sent error event carries data; transport errors do not.
      const data = (e as MessageEvent).data as string | undefined;
      if (data) {
        setErrorMsg((JSON.parse(data) as { message: string }).message);
      } else if (source.readyState === EventSource.CLOSED) {
        setErrorMsg("Stream closed unexpectedly — is the server running?");
      } else {
        return; // transient reconnect attempt
      }
      setState("error");
      source.close();
    });
  };

  const chartData = rows.map((r) => ({
    case: `#${r.index}`,
    "latency (ms)": r.latencyMs,
    "payload (bytes)": r.payloadBytes,
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
            Eval Harness
          </h1>
          <p className="mt-1.5 text-sm text-neutral-400">
            Runs the 10-case benchmark suite against the live MCP endpoint and
            charts each call as it completes.
          </p>
        </div>
        <button
          onClick={run}
          disabled={state === "running"}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {state === "running" ? "Running…" : "Run Benchmark Suite"}
        </button>
      </div>

      {errorMsg && (
        <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
          Live metrics
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
            <XAxis dataKey="case" stroke="#737373" fontSize={12} />
            <YAxis
              yAxisId="latency"
              stroke="#22d3ee"
              fontSize={12}
              label={{
                value: "ms",
                angle: -90,
                position: "insideLeft",
                fill: "#22d3ee",
                fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="payload"
              orientation="right"
              stroke="#fbbf24"
              fontSize={12}
              label={{
                value: "bytes",
                angle: 90,
                position: "insideRight",
                fill: "#fbbf24",
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#171717",
                border: "1px solid #404040",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#e5e5e5" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              yAxisId="latency"
              type="monotone"
              dataKey="latency (ms)"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="payload"
              type="monotone"
              dataKey="payload (bytes)"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {summary && (
        <div className="mt-5 grid grid-cols-4 gap-3 text-center">
          {[
            { label: "passed", value: `${summary.passed}/${summary.total}` },
            { label: "avg latency", value: `${summary.avgLatencyMs} ms` },
            { label: "p95 latency", value: `${summary.p95LatencyMs} ms` },
            { label: "avg payload", value: `${summary.avgPayloadBytes} B` },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3"
            >
              <div className="text-lg font-semibold text-neutral-100">{s.value}</div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Test case</th>
                <th className="px-4 py-2.5 font-medium">Tool</th>
                <th className="px-4 py-2.5 text-right font-medium">Latency</th>
                <th className="px-4 py-2.5 text-right font-medium">Payload</th>
                <th className="px-4 py-2.5 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70 bg-neutral-900/30">
              {rows.map((r) => (
                <tr key={r.index}>
                  <td className="px-4 py-2.5 text-neutral-500">{r.index}</td>
                  <td className="px-4 py-2.5 text-neutral-200">{r.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">
                    {r.tool}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-cyan-300">
                    {r.latencyMs} ms
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-300">
                    {r.payloadBytes} B
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {r.pass ? (
                      <CheckCircle2 className="inline h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="inline h-4 w-4 text-red-400" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
