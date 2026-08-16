/**
 * MCP server factory — the Registry Pattern.
 *
 * Exactly TWO tools are exposed so connected LLM clients pay a minimal,
 * constant context cost regardless of how many domains/keys live in the
 * store:
 *
 *   query_nodus_state  { domain, query }        -> read context
 *   update_nodus_state { domain, key, value }   -> write context
 *
 * A fresh McpServer is created per client connection (an MCP Server instance
 * binds to exactly one transport); all instances share the SQLite store.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { upsertNode, getNode, listDomain, searchNodes, type ContextNode } from "../db";
import { recordActivity } from "../activity";

type CompactNode = Pick<ContextNode, "key" | "value" | "updated_at">;

/** Strip the numeric id / created_at so query payloads stay lean. */
function compact(node: ContextNode): CompactNode {
  return { key: node.key, value: node.value, updated_at: node.updated_at };
}

function jsonResult(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
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

  server.registerTool(
    "query_nodus_state",
    {
      title: "Query Nodus state",
      description:
        "Fetch shared context from the Nodus memory brain. " +
        "Pass a domain (e.g. 'tasks', 'snippets', 'notes') and a query. " +
        "If the query exactly matches a key, that entry is returned; " +
        "pass '*' to list everything in the domain; any other text performs " +
        "a substring search over keys and values.",
      inputSchema: {
        domain: z
          .string()
          .min(1)
          .max(128)
          .describe("Logical namespace to read from"),
        query: z
          .string()
          .max(1024)
          .describe("Exact key, '*' for all entries, or a search term"),
      },
    },
    async ({ domain, query }) => {
      const trimmed = query.trim();

      if (trimmed === "*" || trimmed === "") {
        return jsonResult({ domain, matches: listDomain(domain).map(compact) });
      }

      const exact = getNode(domain, trimmed);
      if (exact) {
        return jsonResult({ domain, matches: [compact(exact)] });
      }

      return jsonResult({
        domain,
        matches: searchNodes(domain, trimmed).map(compact),
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

  return server;
}
