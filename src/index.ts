/**
 * Nodus entrypoint — shared, persistent MCP context server plus its web
 * control plane. See README.md for architecture and client setup.
 */

import { createApp } from "./app";
import { PORT, UI_DIST_PATH } from "./config";
import { logger } from "./logger";

createApp().listen(PORT, () => {
  logger.info("nodus_listening", {
    url: `http://localhost:${PORT}`,
    sse: "/sse",
    messages: "/messages",
    streamableHttp: "/mcp",
    dashboard: UI_DIST_PATH ?? "not built (npm run build:ui)",
  });
});
