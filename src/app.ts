/**
 * Express application assembly: middleware, MCP transports, REST API, and
 * the statically served dashboard.
 */

import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import { UI_DIST_PATH } from "./config";
import { mountMcpTransports } from "./mcp/transports";
import { createApiRouter } from "./api/router";
import { errorMessage, logger } from "./logger";

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

  app.use("/api", createApiRouter(sessions));

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

  // Final error boundary: log the details server-side, return a clean JSON
  // body, and never leak stack traces or internals to clients. The unused
  // `next` parameter is required — Express identifies error middleware by
  // its four-argument signature.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error("unhandled_request_error", {
      method: req.method,
      path: req.path,
      error: errorMessage(err),
    });
    if (res.headersSent) {
      // Mid-stream failure (SSE): the response can only be terminated.
      res.end();
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
