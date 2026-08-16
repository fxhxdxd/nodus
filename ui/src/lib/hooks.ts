/**
 * Data-layer hooks. Views stay presentational; fetching, mutation, polling,
 * and SSE state machines live here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_STREAM_URL,
  EVAL_STREAM_URL,
  deleteNode,
  fetchActivity,
  fetchClients,
  fetchDomains,
  fetchEvalRuns,
  fetchHealth,
  fetchNodes,
  fetchSessions,
  fetchStats,
  saveNode,
} from "./api";
import type {
  ActiveSession,
  ActivityEvent,
  ClientSeen,
  ContextNode,
  EvalRow,
  EvalRunRecord,
  EvalSummary,
  HealthStatus,
  StoreStats,
} from "./types";

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

// ---------------------------------------------------------------------------
// Store (nodes + stats + domains)
// ---------------------------------------------------------------------------

export interface StoreFilter {
  q: string;
  domain: string | null;
}

export interface StoreState {
  nodes: ContextNode[];
  stats: StoreStats | null;
  domains: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveEntry: (domain: string, key: string, value: string) => Promise<void>;
  removeNode: (node: ContextNode) => Promise<void>;
  /** Restore the last deleted node (undo). */
  restore: (node: ContextNode) => Promise<void>;
}

export function useStore(filter: StoreFilter): StoreState {
  const [nodes, setNodes] = useState<ContextNode[]>([]);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, stats, domains] = await Promise.all([
        fetchNodes({ q: filter.q || undefined, domain: filter.domain ?? undefined }),
        fetchStats(),
        fetchDomains(),
      ]);
      setNodes(page.nodes);
      setStats(stats);
      setDomains(domains);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filter.q, filter.domain]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveEntry = useCallback(
    async (domain: string, key: string, value: string) => {
      await saveNode(domain, key, value); // errors propagate to the caller (modal)
      await refresh();
    },
    [refresh]
  );

  const removeNode = useCallback(
    async (node: ContextNode) => {
      try {
        await deleteNode(node.id);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [refresh]
  );

  const restore = useCallback(
    async (node: ContextNode) => {
      try {
        await saveNode(node.domain, node.key, node.value);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [refresh]
  );

  return { nodes, stats, domains, loading, error, refresh, saveEntry, removeNode, restore };
}

// ---------------------------------------------------------------------------
// Server health
// ---------------------------------------------------------------------------

export interface HealthState {
  online: boolean;
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
// Connections (live sessions + clients ever seen)
// ---------------------------------------------------------------------------

export interface ConnectionsState {
  sessions: ActiveSession[];
  seen: ClientSeen[];
}

export function useConnections(pollMs = 4000): ConnectionsState {
  const [state, setState] = useState<ConnectionsState>({ sessions: [], seen: [] });

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [sessions, seen] = await Promise.all([fetchSessions(), fetchClients()]);
        if (!cancelled) setState({ sessions, seen });
      } catch {
        if (!cancelled) setState({ sessions: [], seen: [] });
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return state;
}

// ---------------------------------------------------------------------------
// Activity feed (history + live SSE)
// ---------------------------------------------------------------------------

const ACTIVITY_CAP = 100;

export function useActivity(): ActivityEvent[] {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    void fetchActivity().then(
      (history) => {
        if (!cancelled) setEvents(history);
      },
      () => undefined
    );

    const source = new EventSource(ACTIVITY_STREAM_URL);
    source.addEventListener("activity", (e) => {
      const event = parseEvent<ActivityEvent>(e);
      if (event) {
        setEvents((prev) =>
          [event, ...prev.filter((p) => p.id !== event.id)].slice(0, ACTIVITY_CAP)
        );
      }
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  return events;
}

// ---------------------------------------------------------------------------
// Eval run history
// ---------------------------------------------------------------------------

export interface EvalRunsState {
  runs: EvalRunRecord[];
  refresh: () => Promise<void>;
}

export function useEvalRuns(): EvalRunsState {
  const [runs, setRuns] = useState<EvalRunRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRuns(await fetchEvalRuns());
    } catch {
      // history is non-critical; leave the previous list in place
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { runs, refresh };
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

export function useEvalStream(onDone?: () => void): EvalStreamState {
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [state, setState] = useState<EvalRunState>("idle");
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

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
        onDoneRef.current?.();
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
