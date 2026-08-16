import type {
  ActiveSession,
  ActivityEvent,
  ClientSeen,
  ContextNode,
  EvalRunRecord,
  HealthStatus,
  NodesPage,
  StoreStats,
} from "./types";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      // non-JSON error body
    }
    throw new Error(detail || `${init?.method ?? "GET"} ${input} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export interface NodeQuery {
  q?: string;
  domain?: string;
  limit?: number;
  offset?: number;
}

export function fetchNodes(query: NodeQuery = {}): Promise<NodesPage> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.domain) params.set("domain", query.domain);
  params.set("limit", String(query.limit ?? 500));
  params.set("offset", String(query.offset ?? 0));
  return request<NodesPage>(`/api/nodes?${params}`);
}

export async function saveNode(
  domain: string,
  key: string,
  value: string
): Promise<ContextNode> {
  const { node } = await request<{ node: ContextNode }>(
    "/api/nodes",
    jsonInit("POST", { domain, key, value })
  );
  return node;
}

export async function deleteNode(id: number): Promise<void> {
  await request(`/api/nodes/${id}`, { method: "DELETE" });
}

export async function fetchDomains(): Promise<string[]> {
  return (await request<{ domains: string[] }>("/api/domains")).domains;
}

export function fetchStats(): Promise<StoreStats> {
  return request<StoreStats>("/api/stats");
}

export function fetchHealth(): Promise<HealthStatus> {
  return request<HealthStatus>("/api/health");
}

export async function fetchSessions(): Promise<ActiveSession[]> {
  return (await request<{ sessions: ActiveSession[] }>("/api/sessions")).sessions;
}

export async function fetchClients(): Promise<ClientSeen[]> {
  return (await request<{ clients: ClientSeen[] }>("/api/clients")).clients;
}

export async function fetchActivity(): Promise<ActivityEvent[]> {
  return (await request<{ events: ActivityEvent[] }>("/api/activity")).events;
}

export async function fetchEvalRuns(): Promise<EvalRunRecord[]> {
  return (await request<{ runs: EvalRunRecord[] }>("/api/eval/runs")).runs;
}

export async function importNodes(
  nodes: Array<{ domain: string; key: string; value: string }>
): Promise<number> {
  const { imported } = await request<{ imported: number }>(
    "/api/import",
    jsonInit("POST", { nodes })
  );
  return imported;
}

/** Direct download link (Content-Disposition attachment). */
export const EXPORT_URL = "/api/export";

/** SSE endpoint streaming eval suite results (see useEvalStream). */
export const EVAL_STREAM_URL = "/api/eval/stream";

/** SSE endpoint streaming live activity events (see useActivity). */
export const ACTIVITY_STREAM_URL = "/api/activity/stream";
