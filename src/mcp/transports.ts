/**
 * MCP transport wiring.
 *
 * Two transports are mounted side by side so every client generation works:
 *
 *   Legacy HTTP+SSE   GET /sse + POST /messages?sessionId=...   (Cursor,
 *                     Claude Code, mcp-remote bridges)
 *   Streamable HTTP   ALL /mcp, keyed by the mcp-session-id header (Codex,
 *                     modern MCP clients)
 */

import { randomUUID } from "crypto";
import type { Express, Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createNodusServer } from "./server";

export interface McpSessionStats {
  readonly sse: number;
  readonly http: number;
}

export function mountMcpTransports(app: Express): McpSessionStats {
  const sseTransports = new Map<string, SSEServerTransport>();
  const httpTransports = new Map<string, StreamableHTTPServerTransport>();

  // --- Legacy HTTP+SSE ----------------------------------------------------

  app.get("/sse", async (_req: Request, res: Response) => {
    const transport = new SSEServerTransport("/messages", res);
    sseTransports.set(transport.sessionId, transport);

    res.on("close", () => {
      sseTransports.delete(transport.sessionId);
    });

    await createNodusServer().connect(transport); // starts the SSE stream
  });

  app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId;
    if (typeof sessionId !== "string") {
      res.status(400).json({ error: "Missing sessionId query parameter" });
      return;
    }
    const transport = sseTransports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: `No active session: ${sessionId}` });
      return;
    }
    // Body was consumed by express.json(); hand the parsed copy to the SDK.
    await transport.handlePostMessage(req, res, req.body);
  });

  // --- Streamable HTTP ----------------------------------------------------

  app.all("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"];
    const existing =
      typeof sessionId === "string" ? httpTransports.get(sessionId) : undefined;

    if (existing) {
      await existing.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          httpTransports.set(sid, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) httpTransports.delete(transport.sessionId);
      };
      await createNodusServer().connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "No valid session. Send initialize first." },
      id: null,
    });
  });

  return {
    get sse() {
      return sseTransports.size;
    },
    get http() {
      return httpTransports.size;
    },
  };
}
