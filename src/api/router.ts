/**
 * Dashboard REST API.
 *
 *   GET    /api/nodes        list every context node
 *   DELETE /api/nodes/:id    delete a node by id
 *   GET    /api/stats        store totals + database size
 *   GET    /api/eval/stream  run the eval suite, streaming results as SSE
 */

import express, { type Request, type Response, type Router } from "express";
import { listAllNodes, deleteNodeById, getStats } from "../db";
import { runEvalSuite } from "../eval/suite";
import { PORT } from "../config";

export function createApiRouter(): Router {
  const api = express.Router();

  api.get("/nodes", (_req: Request, res: Response) => {
    res.json({ nodes: listAllNodes() });
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
      if (!clientGone) {
        const message = err instanceof Error ? err.message : String(err);
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      }
    }
    res.end();
  });

  return api;
}
