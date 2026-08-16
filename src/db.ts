/**
 * Nodus persistence layer.
 *
 * Wraps better-sqlite3 with a small, safe CRUD surface over the
 * `context_nodes` table. better-sqlite3 is synchronous and runs every
 * statement inside SQLite's own serialization, so concurrent tool calls
 * arriving from multiple MCP clients are safe within a single process.
 * WAL mode is enabled so readers never block the writer.
 */

import Database from "better-sqlite3";
import { DB_PATH } from "./config";

export interface ContextNode {
  id: number;
  domain: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
  /** Client that last wrote this node (MCP clientInfo name, "dashboard", …). */
  updated_by: string | null;
}

export interface ClientSeen {
  name: string;
  version: string;
  transport: string;
  first_seen: string;
  last_seen: string;
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

const db: Database.Database = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS context_nodes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    domain     TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (domain, key)
  );
  CREATE INDEX IF NOT EXISTS idx_context_nodes_domain ON context_nodes (domain);
  CREATE TABLE IF NOT EXISTS clients_seen (
    name       TEXT PRIMARY KEY,
    version    TEXT NOT NULL DEFAULT '',
    transport  TEXT NOT NULL,
    first_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_seen  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS eval_runs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    passed              INTEGER NOT NULL,
    total               INTEGER NOT NULL,
    avg_latency_ms      REAL NOT NULL,
    p95_latency_ms      REAL NOT NULL,
    total_payload_bytes INTEGER NOT NULL
  );
`);

// Migration: updated_by was added after the first release.
const columns = db.pragma("table_info(context_nodes)") as Array<{ name: string }>;
if (!columns.some((c) => c.name === "updated_by")) {
  db.exec("ALTER TABLE context_nodes ADD COLUMN updated_by TEXT");
}

// Prepared statements are compiled once and reused for every call.
// The WHERE clause makes the upsert idempotent: re-sending an identical
// value is a no-op rather than an updated_at churn.
const upsertStmt = db.prepare(`
  INSERT INTO context_nodes (domain, key, value, updated_by)
  VALUES (@domain, @key, @value, @updatedBy)
  ON CONFLICT (domain, key) DO UPDATE SET
    value      = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE excluded.value <> context_nodes.value
`);

const getByDomainKeyStmt = db.prepare(
  `SELECT * FROM context_nodes WHERE domain = ? AND key = ?`
);

const listByDomainStmt = db.prepare(
  `SELECT * FROM context_nodes WHERE domain = ? ORDER BY updated_at DESC LIMIT ?`
);

const searchStmt = db.prepare(`
  SELECT * FROM context_nodes
  WHERE domain = ? AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\')
  ORDER BY updated_at DESC
  LIMIT ?
`);

const deleteStmt = db.prepare(
  `DELETE FROM context_nodes WHERE domain = ? AND key = ?`
);

const listAllStmt = db.prepare(
  `SELECT * FROM context_nodes ORDER BY domain ASC, updated_at DESC LIMIT ? OFFSET ?`
);

const listByFilterStmt = db.prepare(`
  SELECT * FROM context_nodes
  WHERE (@domain IS NULL OR domain = @domain)
    AND (@pattern IS NULL OR domain LIKE @pattern ESCAPE '\\'
         OR key LIKE @pattern ESCAPE '\\' OR value LIKE @pattern ESCAPE '\\')
  ORDER BY domain ASC, updated_at DESC
  LIMIT @limit OFFSET @offset
`);

const getByIdStmt = db.prepare(`SELECT * FROM context_nodes WHERE id = ?`);

const deleteByIdStmt = db.prepare(`DELETE FROM context_nodes WHERE id = ?`);

const countStmt = db.prepare(
  `SELECT COUNT(*) AS total, COUNT(DISTINCT domain) AS domains FROM context_nodes`
);

const listDomainsStmt = db.prepare(
  `SELECT DISTINCT domain FROM context_nodes ORDER BY domain ASC`
);

const domainCountsStmt = db.prepare(
  `SELECT domain, COUNT(*) AS entries FROM context_nodes GROUP BY domain ORDER BY domain ASC`
);

const countByFilterStmt = db.prepare(`
  SELECT COUNT(*) AS total FROM context_nodes
  WHERE (@domain IS NULL OR domain = @domain)
    AND (@pattern IS NULL OR domain LIKE @pattern ESCAPE '\\'
         OR key LIKE @pattern ESCAPE '\\' OR value LIKE @pattern ESCAPE '\\')
`);

const upsertClientSeenStmt = db.prepare(`
  INSERT INTO clients_seen (name, version, transport)
  VALUES (@name, @version, @transport)
  ON CONFLICT (name) DO UPDATE SET
    version   = excluded.version,
    transport = excluded.transport,
    last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);

const listClientsSeenStmt = db.prepare(
  `SELECT * FROM clients_seen ORDER BY last_seen DESC`
);

const insertEvalRunStmt = db.prepare(`
  INSERT INTO eval_runs (passed, total, avg_latency_ms, p95_latency_ms, total_payload_bytes)
  VALUES (@passed, @total, @avgLatencyMs, @p95LatencyMs, @totalPayloadBytes)
`);

const listEvalRunsStmt = db.prepare(
  `SELECT * FROM eval_runs ORDER BY id DESC LIMIT ?`
);

/** Escape LIKE wildcards in user-supplied search text. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Insert or update a context node (idempotent). Returns the stored row. */
export function upsertNode(
  domain: string,
  key: string,
  value: string,
  updatedBy: string | null = null
): ContextNode {
  upsertStmt.run({ domain, key, value, updatedBy });
  const node = getByDomainKeyStmt.get(domain, key) as ContextNode | undefined;
  if (!node) {
    throw new Error(`Upsert failed to persist ${domain}/${key}`);
  }
  return node;
}

/** Exact lookup of a single node by domain + key. */
export function getNode(domain: string, key: string): ContextNode | undefined {
  return getByDomainKeyStmt.get(domain, key) as ContextNode | undefined;
}

/** All nodes in a domain, most recently updated first. */
export function listDomain(domain: string, limit = 50): ContextNode[] {
  return listByDomainStmt.all(domain, limit) as ContextNode[];
}

/** Substring search across keys and values within a domain. */
export function searchNodes(domain: string, term: string, limit = 50): ContextNode[] {
  const pattern = `%${escapeLike(term)}%`;
  return searchStmt.all(domain, pattern, pattern, limit) as ContextNode[];
}

/** Delete a node. Returns true if a row was removed. */
export function deleteNode(domain: string, key: string): boolean {
  return deleteStmt.run(domain, key).changes > 0;
}

export interface NodeFilter {
  domain?: string;
  q?: string;
  limit: number;
  offset: number;
}

/** A page of nodes, optionally filtered by domain and/or search term. */
export function listNodes(filter: NodeFilter): ContextNode[] {
  const pattern = filter.q ? `%${escapeLike(filter.q)}%` : null;
  if (!filter.domain && !pattern) {
    return listAllStmt.all(filter.limit, filter.offset) as ContextNode[];
  }
  return listByFilterStmt.all({
    domain: filter.domain ?? null,
    pattern,
    limit: filter.limit,
    offset: filter.offset,
  }) as ContextNode[];
}

/** Every node — used by export. */
export function exportAllNodes(): ContextNode[] {
  return listAllStmt.all(Number.MAX_SAFE_INTEGER, 0) as ContextNode[];
}

/** Single node lookup by numeric id. */
export function getNodeById(id: number): ContextNode | undefined {
  return getByIdStmt.get(id) as ContextNode | undefined;
}

/** Total number of stored nodes. */
export function countNodes(): number {
  return (countStmt.get() as { total: number }).total;
}

/** Distinct domain names, alphabetical. */
export function listDomains(): string[] {
  return (listDomainsStmt.all() as Array<{ domain: string }>).map((r) => r.domain);
}

export interface DomainCount {
  domain: string;
  entries: number;
}

/** Every domain with its entry count, alphabetical. */
export function listDomainCounts(): DomainCount[] {
  return domainCountsStmt.all() as DomainCount[];
}

/** Count of nodes matching an optional domain and/or search term. */
export function countByFilter(domain?: string, q?: string): number {
  const row = countByFilterStmt.get({
    domain: domain ?? null,
    pattern: q ? `%${escapeLike(q)}%` : null,
  }) as { total: number };
  return row.total;
}

/** Record that an MCP client connected (upserts by client name). */
export function recordClientSeen(name: string, version: string, transport: string): void {
  upsertClientSeenStmt.run({ name, version, transport });
}

/** Clients that have ever connected, most recent first. */
export function listClientsSeen(): ClientSeen[] {
  return listClientsSeenStmt.all() as ClientSeen[];
}

/** Persist an eval run summary for the history view. */
export function insertEvalRun(run: {
  passed: number;
  total: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalPayloadBytes: number;
}): void {
  insertEvalRunStmt.run(run);
}

/** Most recent eval runs, newest first. */
export function listEvalRuns(limit = 20): EvalRunRecord[] {
  return listEvalRunsStmt.all(limit) as EvalRunRecord[];
}

/** Delete a node by numeric id. Returns true if a row was removed. */
export function deleteNodeById(id: number): boolean {
  return deleteByIdStmt.run(id).changes > 0;
}

export interface StoreStats {
  totalNodes: number;
  domains: number;
  dbSizeBytes: number;
}

/** Aggregate stats for the dashboard. */
export function getStats(): StoreStats {
  const row = countStmt.get() as { total: number; domains: number };
  const pageCount = db.pragma("page_count", { simple: true }) as number;
  const pageSize = db.pragma("page_size", { simple: true }) as number;
  return {
    totalNodes: row.total,
    domains: row.domains,
    dbSizeBytes: pageCount * pageSize,
  };
}

/** Close the underlying database handle (used by tests / shutdown hooks). */
export function closeDb(): void {
  db.close();
}
