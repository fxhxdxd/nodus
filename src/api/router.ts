/**
 * Dashboard REST API.
 *
 *   GET    /api/health           liveness + session counts
 *   GET    /api/sessions         live MCP sessions with client identity
 *   GET    /api/clients          clients that have ever connected
 *   GET    /api/nodes            paginated nodes (+ ?q= search, ?domain= filter)
 *   POST   /api/nodes            create/update a node from the dashboard
 *   DELETE /api/nodes/:id        delete a node
 *   GET    /api/domains          distinct domain names
 *   GET    /api/stats            store totals + database size
 *   GET    /api/export           full JSON export (download)
 *   POST   /api/import           JSON import (upserts)
 *   GET    /api/activity         recent activity events
 *   GET    /api/activity/stream  live activity events as SSE
 *   GET    /api/eval/runs        persisted eval run history
 *   GET    /api/eval/stream      run the eval suite, streaming results as SSE
 */

import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import {
  countNodes,
  deleteNodeById,
  exportAllNodes,
  getNodeById,
  getStats,
  insertEvalRun,
  listClientsSeen,
  listDomains,
  listEvalRuns,
  listNodes,
  upsertNode,
} from "../db";
import { onActivity, recentActivity, recordActivity } from "../activity";
import { runEvalSuite } from "../eval/suite";
import { PORT } from "../config";
import { errorMessage, logger } from "../logger";
import type { McpGateway } from "../mcp/transports";

const nodeInputSchema = z.object({
  domain: z.string().min(1).max(128),
  key: z.string().min(1).max(256),
  value: z.string().max(65536),
});

const importSchema = z.object({
  nodes: z.array(nodeInputSchema).min(1).max(1000),
});

/** Parse a query parameter as a bounded non-negative integer. */
function intParam(
  raw: unknown,
  fallback: number,
  min: number,
  max: number
): number | undefined {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return undefined;
  return value;
}

function strParam(raw: unknown, maxLength: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" || trimmed.length > maxLength ? undefined : trimmed;
}

/** Standard SSE response setup; returns a "client gone" checker. */
function openSse(req: Request, res: Response): () => boolean {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();
  let gone = false;
  req.on("close", () => {
    gone = true;
  });
  return () => gone;
}

export function createApiRouter(gateway: McpGateway): Router {
  const api = express.Router();

  // --- Liveness & connections --------------------------------------------

  api.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      sessions: { sse: gateway.sse, http: gateway.http },
    });
  });

  api.get("/sessions", (_req: Request, res: Response) => {
    res.json({ sessions: gateway.sessions() });
  });

  api.get("/clients", (_req: Request, res: Response) => {
    res.json({ clients: listClientsSeen() });
  });

  // --- Nodes --------------------------------------------------------------

  api.get("/nodes", (req: Request, res: Response) => {
    const limit = intParam(req.query.limit, 500, 1, 1000);
    const offset = intParam(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    if (limit === undefined || offset === undefined) {
      res.status(400).json({
        error: "limit must be 1-1000 and offset a non-negative integer",
      });
      return;
    }
    const nodes = listNodes({
      limit,
      offset,
      domain: strParam(req.query.domain, 128),
      q: strParam(req.query.q, 256),
    });
    res.json({ nodes, total: countNodes(), limit, offset });
  });

  api.post("/nodes", (req: Request, res: Response) => {
    const parsed = nodeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { domain, key, value } = parsed.data;
    const node = upsertNode(domain, key, value, "dashboard");
    recordActivity({ type: "write", domain, key, by: "dashboard", preview: value });
    res.json({ node });
  });

  api.delete("/nodes/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "id must be a positive integer" });
      return;
    }
    const node = getNodeById(id);
    if (!node || !deleteNodeById(id)) {
      res.status(404).json({ error: `No node with id ${id}` });
      return;
    }
    recordActivity({
      type: "delete",
      domain: node.domain,
      key: node.key,
      by: "dashboard",
    });
    res.json({ ok: true, id });
  });

  api.get("/domains", (_req: Request, res: Response) => {
    res.json({ domains: listDomains() });
  });

  api.get("/stats", (_req: Request, res: Response) => {
    res.json(getStats());
  });

  // --- Export / import ----------------------------------------------------

  api.get("/export", (_req: Request, res: Response) => {
    res.setHeader("Content-Disposition", 'attachment; filename="nodus-export.json"');
    res.json({
      exported_at: new Date().toISOString(),
      nodes: exportAllNodes().map(({ domain, key, value }) => ({ domain, key, value })),
    });
  });

  api.post("/import", (req: Request, res: Response) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: `Expected { nodes: [{domain, key, value}, ...] } — ${parsed.error.issues[0]?.message ?? "invalid input"}`,
      });
      return;
    }
    for (const { domain, key, value } of parsed.data.nodes) {
      upsertNode(domain, key, value, "import");
    }
    const count = parsed.data.nodes.length;
    recordActivity({
      type: "import",
      domain: "*",
      key: `${count} entries`,
      by: "dashboard",
    });
    res.json({ ok: true, imported: count });
  });

  // --- Activity -----------------------------------------------------------

  api.get("/activity", (_req: Request, res: Response) => {
    res.json({ events: recentActivity() });
  });

  api.get("/activity/stream", (req: Request, res: Response) => {
    const isGone = openSse(req, res);
    const unsubscribe = onActivity((event) => {
      if (!isGone()) {
        res.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
      }
    });
    // Heartbeat keeps intermediaries from timing out the idle stream.
    const heartbeat = setInterval(() => {
      if (!isGone()) res.write(": ping\n\n");
    }, 25000);
    req.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });

  // --- Eval ---------------------------------------------------------------

  api.get("/eval/runs", (_req: Request, res: Response) => {
    res.json({ runs: listEvalRuns() });
  });

  // Runs the suite against this server's own MCP endpoint so the numbers
  // match `npm run eval`, and streams each result row as an SSE event.
  api.get("/eval/stream", async (req: Request, res: Response) => {
    const isGone = openSse(req, res);
    try {
      for await (const event of runEvalSuite(`http://localhost:${PORT}/sse`)) {
        if (isGone()) break; // generator's finally closes the MCP client
        if (event.type === "done") {
          insertEvalRun({
            passed: event.summary.passed,
            total: event.summary.total,
            avgLatencyMs: event.summary.avgLatencyMs,
            p95LatencyMs: event.summary.p95LatencyMs,
            totalPayloadBytes: event.summary.totalPayloadBytes,
          });
        }
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      logger.error("eval_stream_failed", { error: errorMessage(err) });
      if (!isGone()) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: "Eval run failed — check server logs" })}\n\n`
        );
      }
    }
    res.end();
  });

  // JSON 404 for unknown API routes (instead of the HTML default).
  api.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  return api;
}
