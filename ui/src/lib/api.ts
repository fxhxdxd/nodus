import type { NodesPage, StoreStats } from "./types";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${input} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function fetchNodes(limit = 500, offset = 0): Promise<NodesPage> {
  return request<NodesPage>(`/api/nodes?limit=${limit}&offset=${offset}`);
}

export function fetchStats(): Promise<StoreStats> {
  return request<StoreStats>("/api/stats");
}

export async function deleteNode(id: number): Promise<void> {
  await request(`/api/nodes/${id}`, { method: "DELETE" });
}

/** SSE endpoint streaming eval suite results (see EvalView). */
export const EVAL_STREAM_URL = "/api/eval/stream";
