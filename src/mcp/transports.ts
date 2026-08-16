/**
 * MCP transport wiring.
 *
 * Two transports are mounted side by side so every client generation works:
 *
 *   Legacy HTTP+SSE   GET /sse + POST /messages?sessionId=...   (Cursor,
 *                     Claude Code, mcp-remote bridges)
 *   Streamable HTTP   ALL /mcp, keyed by the mcp-session-id header (Codex,
 *                     modern MCP clients)
 *
 * Each live session is tracked with the identity its client announced in
 * the MCP initialize handshake, powering the dashboard's connection views.
 */

import { randomUUID } from "crypto";
import type { Express, Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createNodusServer } from "./server";
import { recordClientSeen } from "../db";
import { logger } from "../logger";

export type TransportKind = "sse" | "http";

export interface ActiveSession {
  sessionId: string;
  transport: TransportKind;
  connectedAt: string;
  client: { name: string; version: string } | null;
}

export interface McpGateway {
  readonly sse: number;
  readonly http: number;
  sessions(): ActiveSession[];
}

interface TrackedSession {
  server: McpServer;
  transport: TransportKind;
  connectedAt: string;
}

export function mountMcpTransports(app: Express): McpGateway {
  const sseTransports = new Map<string, SSEServerTransport>();
  const httpTransports = new Map<string, StreamableHTTPServerTransport>();
  const tracked = new Map<string, TrackedSession>();

  function track(sessionId: string, server: McpServer, transport: TransportKind): void {
    tracked.set(sessionId, {
      server,
      transport,
      connectedAt: new Date().toISOString(),
    });
    server.server.oninitialized = () => {
      const info = server.server.getClientVersion();
      if (info) {
        recordClientSeen(info.name, info.version ?? "", transport);
        logger.info("mcp_client_connected", {
          client: info.name,
          version: info.version,
          transport,
        });
      }
    };
  }

  // --- Legacy HTTP+SSE ----------------------------------------------------

  app.get("/sse", async (_req: Request, res: Response) => {
    const transport = new SSEServerTransport("/messages", res);
    sseTransports.set(transport.sessionId, transport);

    res.on("close", () => {
      sseTransports.delete(transport.sessionId);
      tracked.delete(transport.sessionId);
    });

    const server = createNodusServer();
    track(transport.sessionId, server, "sse");
    await server.connect(transport); // starts the SSE stream
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
      const server = createNodusServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          httpTransports.set(sid, transport);
          track(sid, server, "http");
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          httpTransports.delete(transport.sessionId);
          tracked.delete(transport.sessionId);
        }
      };
      await server.connect(transport);
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
    sessions() {
      return [...tracked.entries()].map(([sessionId, s]) => {
        const info = s.server.server.getClientVersion();
        return {
          sessionId,
          transport: s.transport,
          connectedAt: s.connectedAt,
          client: info ? { name: info.name, version: info.version ?? "" } : null,
        };
      });
    },
  };
}
