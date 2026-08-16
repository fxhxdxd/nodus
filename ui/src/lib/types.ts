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
}

export interface StoreStats {
  totalNodes: number;
  domains: number;
  dbSizeBytes: number;
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
