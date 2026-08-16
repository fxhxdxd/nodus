/**
 * API contract types. These mirror the backend responses:
 *   ContextNode / StoreStats   -> src/db.ts
 *   EvalRow / EvalSummary      -> src/eval/suite.ts
 */

export interface ContextNode {
  id: number;
  domain: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ActiveSession {
  sessionId: string;
  transport: "sse" | "http";
  connectedAt: string;
  client: { name: string; version: string } | null;
}

export interface ClientSeen {
  name: string;
  version: string;
  transport: string;
  first_seen: string;
  last_seen: string;
}

export interface ActivityEvent {
  id: number;
  type: "write" | "delete" | "import";
  domain: string;
  key: string;
  by: string;
  preview: string;
  at: string;
}

export interface EvalRunRecord {
  id: number;
  ran_at: string;
  passed: number;
  total: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  total_payload_bytes: number;
}

export interface StoreStats {
  totalNodes: number;
  domains: number;
  dbSizeBytes: number;
}

export interface NodesPage {
  nodes: ContextNode[];
  total: number;
  limit: number;
  offset: number;
}

export interface HealthStatus {
  status: string;
  sessions: {
    sse: number;
    http: number;
  };
}

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
