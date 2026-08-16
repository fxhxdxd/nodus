/**
 * Express application assembly: middleware, MCP transports, REST API, and
 * the statically served dashboard.
 */

import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { UI_DIST_PATH } from "./config";
import { mountMcpTransports } from "./mcp/transports";
import { createApiRouter } from "./api/router";

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "4mb" }));

  const sessions = mountMcpTransports(app);

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      sessions: { sse: sessions.sse, http: sessions.http },
    });
  });

  app.use("/api", createApiRouter());

  if (UI_DIST_PATH) {
    app.use(express.static(UI_DIST_PATH));
  } else {
    app.get("/", (_req: Request, res: Response) => {
      res
        .status(200)
        .send(
          "<h1>Nodus</h1><p>Dashboard not built yet. Run <code>npm run build:ui</code> and restart.</p>"
        );
    });
  }

  return app;
}
