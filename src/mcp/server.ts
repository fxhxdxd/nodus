/**
 * MCP server factory — the Registry Pattern.
 *
 * A fixed, four-tool surface, so connected LLM clients pay a constant
 * context cost regardless of how many domains or entries the store holds:
 *
 *   query_nodus_state   { domain?, query, limit? }  -> read/search (global when domain omitted)
 *   update_nodus_state  { domain, key, value }      -> write context
 *   delete_nodus_state  { domain, key }             -> remove context (separately gateable)
 *   list_nodus_domains  {}                          -> domain index with counts
 *
 * Tool descriptions are built per connection and embed the live domain
 * list, so agents see the real namespace before their first call.
 *
 * A fresh McpServer is created per client connection (an MCP Server
 * instance binds to exactly one transport); all instances share SQLite.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  countByFilter,
  deleteNode,
  getNode,
  listDomain,
  listDomainCounts,
  listNodes,
  searchNodes,
  upsertNode,
  type ContextNode,
} from "../db";
import { recordActivity } from "../activity";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DESCRIPTION_DOMAIN_CAP = 20;

interface CompactNode {
  domain: string;
  key: string;
  value: string;
  updated_at: string;
}

/** Strip ids/created_at so query payloads stay lean; keep domain so global
 * search results say where each match lives. */
function compact(node: ContextNode): CompactNode {
  return {
    domain: node.domain,
    key: node.key,
    value: node.value,
    updated_at: node.updated_at,
  };
}

function jsonResult(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/** "affirmations (1), notes (3), tasks (5)" — capped, for tool descriptions. */
function domainsHint(): string {
  const counts = listDomainCounts();
  if (counts.length === 0) return "The store is currently empty.";
  const shown = counts.slice(0, DESCRIPTION_DOMAIN_CAP);
  const listed = shown.map((d) => `${d.domain} (${d.entries})`).join(", ");
  const more = counts.length > shown.length ? `, +${counts.length - shown.length} more` : "";
  return `Domains right now: ${listed}${more}.`;
}

/** Build a fresh McpServer wired to the shared SQLite store. */
export function createNodusServer(): McpServer {
  const server = new McpServer({
    name: "nodus",
    version: "1.0.0",
  });

  /** Name from the connected client's MCP initialize handshake. */
  const clientName = (): string =>
    server.server.getClientVersion()?.name ?? "unknown client";

  const hint = domainsHint();

  server.registerTool(
    "query_nodus_state",
    {
      title: "Query Nodus state",
      description:
        "Read shared context from the Nodus memory brain. " +
        "OMIT domain to search every domain at once (do this when unsure " +
        "where something lives). With a domain: an exact key match returns " +
        "that entry, '*' lists the domain, other text searches it. " +
        "Omitting domain with query '*' returns the domain index. " +
        hint,
      inputSchema: {
        domain: z
          .string()
          .max(128)
          .optional()
          .describe("Namespace to read. Omit (or pass '*') to search all domains"),
        query: z
          .string()
          .max(1024)
          .describe("Exact key, '*' to list, or a search term"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .describe(`Max results (default ${DEFAULT_LIMIT})`),
      },
    },
    async ({ domain, query, limit }) => {
      const max = limit ?? DEFAULT_LIMIT;
      const term = query.trim();
      const scope = domain?.trim();
      const isGlobal = !scope || scope === "*";
      const listAll = term === "*" || term === "";

      if (isGlobal && listAll) {
        const domains = listDomainCounts();
        return jsonResult({
          domains,
          total: domains.reduce((a, d) => a + d.entries, 0),
        });
      }

      if (isGlobal) {
        const matches = listNodes({ q: term, limit: max, offset: 0 });
        const total = countByFilter(undefined, term);
        return jsonResult({
          matches: matches.map(compact),
          total,
          truncated: total > matches.length,
        });
      }

      if (listAll) {
        const matches = listDomain(scope, max);
        const total = countByFilter(scope);
        return jsonResult({
          domain: scope,
          matches: matches.map(compact),
          total,
          truncated: total > matches.length,
        });
      }

      const exact = getNode(scope, term);
      if (exact) {
        return jsonResult({
          domain: scope,
          matches: [compact(exact)],
          total: 1,
          truncated: false,
        });
      }

      const matches = searchNodes(scope, term, max);
      const total = countByFilter(scope, term);
      return jsonResult({
        domain: scope,
        matches: matches.map(compact),
        total,
        truncated: total > matches.length,
      });
    }
  );

  server.registerTool(
    "update_nodus_state",
    {
      title: "Update Nodus state",
      description:
        "Write shared context into the Nodus memory brain so other AI " +
        "surfaces (Cursor, Claude Code, Codex) can read it. Upserts by " +
        "(domain, key): an existing entry with the same key is overwritten.",
      inputSchema: {
        domain: z
          .string()
          .min(1)
          .max(128)
          .describe("Logical namespace to write to"),
        key: z.string().min(1).max(256).describe("Identifier within the domain"),
        value: z
          .string()
          .max(65536)
          .describe("Content to store (plain text or JSON), up to 64 KB"),
      },
    },
    async ({ domain, key, value }) => {
      const by = clientName();
      const node = upsertNode(domain, key, value, by);
      recordActivity({ type: "write", domain, key, by, preview: value });
      return jsonResult({
        ok: true,
        domain: node.domain,
        key: node.key,
        updated_at: node.updated_at,
      });
    }
  );

  server.registerTool(
    "delete_nodus_state",
    {
      title: "Delete Nodus state",
      description:
        "Remove one entry from the Nodus memory brain by exact domain and " +
        "key. Use this to clean up stale or wrong context. Idempotent: " +
        "deleting a missing entry succeeds with deleted=false.",
      inputSchema: {
        domain: z.string().min(1).max(128).describe("Namespace of the entry"),
        key: z.string().min(1).max(256).describe("Exact key to delete"),
      },
    },
    async ({ domain, key }) => {
      const deleted = deleteNode(domain, key);
      if (deleted) {
        recordActivity({ type: "delete", domain, key, by: clientName() });
      }
      return jsonResult({ ok: true, deleted, domain, key });
    }
  );

  server.registerTool(
    "list_nodus_domains",
    {
      title: "List Nodus domains",
      description:
        "List every domain in the Nodus memory brain with its entry count. " +
        "Call this to learn where context lives before querying. " +
        hint,
      inputSchema: {},
    },
    async () => {
      const domains = listDomainCounts();
      return jsonResult({
        domains,
        total: domains.reduce((a, d) => a + d.entries, 0),
      });
    }
  );

  return server;
}
