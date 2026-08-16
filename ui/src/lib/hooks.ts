/**
 * Data-layer hooks. Views stay presentational; fetching, mutation, and the
 * eval SSE state machine live here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteNode, fetchHealth, fetchNodes, fetchStats, EVAL_STREAM_URL } from "./api";
import type { ContextNode, EvalRow, EvalSummary, HealthStatus, StoreStats } from "./types";

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Store (nodes + stats)
// ---------------------------------------------------------------------------

export interface StoreState {
  nodes: ContextNode[];
  stats: StoreStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  removeNode: (id: number) => Promise<void>;
}

export function useStore(): StoreState {
  const [nodes, setNodes] = useState<ContextNode[]>([]);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, stats] = await Promise.all([fetchNodes(), fetchStats()]);
      setNodes(page.nodes);
      setStats(stats);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeNode = useCallback(
    async (id: number) => {
      try {
        await deleteNode(id);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [refresh]
  );

  return { nodes, stats, loading, error, refresh, removeNode };
}

// ---------------------------------------------------------------------------
// Server health
// ---------------------------------------------------------------------------

export interface HealthState {
  online: boolean;
  /** Undefined until the first response arrives. */
  health: HealthStatus | null;
}

export function useHealth(pollMs = 5000): HealthState {
  const [state, setState] = useState<HealthState>({ online: true, health: null });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const health = await fetchHealth();
        if (!cancelled) setState({ online: true, health });
      } catch {
        if (!cancelled) setState({ online: false, health: null });
      }
    };

    void check();
    const timer = setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return state;
}

// ---------------------------------------------------------------------------
// Eval stream
// ---------------------------------------------------------------------------

export type EvalRunState = "idle" | "running" | "done" | "error";

export interface EvalStreamState {
  rows: EvalRow[];
  summary: EvalSummary | null;
  state: EvalRunState;
  error: string | null;
  run: () => void;
}

function parseEvent<T>(e: Event): T | null {
  const data = (e as MessageEvent).data;
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export function useEvalStream(): EvalStreamState {
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [state, setState] = useState<EvalRunState>("idle");
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  // Close any live stream when the consuming component unmounts.
  useEffect(() => () => sourceRef.current?.close(), []);

  const run = useCallback(() => {
    sourceRef.current?.close();
    setRows([]);
    setSummary(null);
    setError(null);
    setState("running");

    const source = new EventSource(EVAL_STREAM_URL);
    sourceRef.current = source;

    const fail = (message: string) => {
      setError(message);
      setState("error");
      source.close();
    };

    source.addEventListener("row", (e) => {
      const payload = parseEvent<{ row: EvalRow }>(e);
      if (payload) setRows((prev) => [...prev, payload.row]);
    });

    source.addEventListener("done", (e) => {
      const payload = parseEvent<{ summary: EvalSummary }>(e);
      if (payload) {
        setSummary(payload.summary);
        setState("done");
      } else {
        setError("Malformed summary event");
        setState("error");
      }
      source.close();
    });

    source.addEventListener("error", (e) => {
      // A server-sent error event carries data; transport errors do not.
      const payload = parseEvent<{ message: string }>(e);
      if (payload) {
        fail(payload.message);
      } else if (source.readyState === EventSource.CLOSED) {
        fail("Stream closed unexpectedly — is the server running?");
      }
      // Otherwise: transient reconnect attempt; let EventSource retry.
    });
  }, []);

  return { rows, summary, state, error, run };
}
