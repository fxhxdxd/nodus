/**
 * Dashboard REST API.
 *
 *   GET    /api/nodes        list every context node
 *   DELETE /api/nodes/:id    delete a node by id
 *   GET    /api/stats        store totals + database size
 *   GET    /api/eval/stream  run the eval suite, streaming results as SSE
 */

import express, { type Request, type Response, type Router } from "express";
import { listAllNodes, countNodes, deleteNodeById, getStats } from "../db";
import { runEvalSuite } from "../eval/suite";
import { PORT } from "../config";
import { errorMessage, logger } from "../logger";
import type { McpSessionStats } from "../mcp/transports";

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

export function createApiRouter(sessions: McpSessionStats): Router {
  const api = express.Router();

  // Mirror of GET /health under /api so the dashboard (including the Vite
  // dev proxy, which only forwards /api and the MCP routes) can read it.
  api.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      sessions: { sse: sessions.sse, http: sessions.http },
    });
  });

  api.get("/nodes", (req: Request, res: Response) => {
    const limit = intParam(req.query.limit, 500, 1, 1000);
    const offset = intParam(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    if (limit === undefined || offset === undefined) {
      res.status(400).json({
        error: "limit must be 1-1000 and offset a non-negative integer",
      });
      return;
    }
    res.json({ nodes: listAllNodes(limit, offset), total: countNodes(), limit, offset });
  });

  api.delete("/nodes/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "id must be a positive integer" });
      return;
    }
    if (!deleteNodeById(id)) {
      res.status(404).json({ error: `No node with id ${id}` });
      return;
    }
    res.json({ ok: true, id });
  });

  api.get("/stats", (_req: Request, res: Response) => {
    res.json(getStats());
  });

  // Runs the suite against this server's own MCP endpoint so the numbers
  // match `npm run eval`, and streams each result row as an SSE event.
  api.get("/eval/stream", async (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders?.();

    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
    });

    try {
      for await (const event of runEvalSuite(`http://localhost:${PORT}/sse`)) {
        if (clientGone) break; // generator's finally closes the MCP client
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      logger.error("eval_stream_failed", { error: errorMessage(err) });
      if (!clientGone) {
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
