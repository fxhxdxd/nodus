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
`);

// Prepared statements are compiled once and reused for every call.
// The WHERE clause makes the upsert idempotent: re-sending an identical
// value is a no-op rather than an updated_at churn.
const upsertStmt = db.prepare(`
  INSERT INTO context_nodes (domain, key, value)
  VALUES (@domain, @key, @value)
  ON CONFLICT (domain, key) DO UPDATE SET
    value      = excluded.value,
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

const deleteByIdStmt = db.prepare(`DELETE FROM context_nodes WHERE id = ?`);

const countStmt = db.prepare(
  `SELECT COUNT(*) AS total, COUNT(DISTINCT domain) AS domains FROM context_nodes`
);

/** Escape LIKE wildcards in user-supplied search text. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Insert or update a context node (idempotent). Returns the stored row. */
export function upsertNode(domain: string, key: string, value: string): ContextNode {
  upsertStmt.run({ domain, key, value });
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

/** A page of nodes, grouped by domain, newest first within each. */
export function listAllNodes(limit = 500, offset = 0): ContextNode[] {
  return listAllStmt.all(limit, offset) as ContextNode[];
}

/** Total number of stored nodes. */
export function countNodes(): number {
  return (countStmt.get() as { total: number }).total;
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
