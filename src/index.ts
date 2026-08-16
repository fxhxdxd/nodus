/**
 * Nodus entrypoint — shared, persistent MCP context server plus its web
 * control plane. See README.md for architecture and client setup.
 */

import { createApp } from "./app";
import { PORT, UI_DIST_PATH } from "./config";

createApp().listen(PORT, () => {
  console.log(`Nodus MCP server listening on http://localhost:${PORT}`);
  console.log(`  SSE endpoint (legacy):     GET  http://localhost:${PORT}/sse`);
  console.log(`  Message endpoint (legacy): POST http://localhost:${PORT}/messages`);
  console.log(`  Streamable HTTP endpoint:  ALL  http://localhost:${PORT}/mcp`);
  console.log(
    UI_DIST_PATH
      ? `  Dashboard:                 http://localhost:${PORT} (${UI_DIST_PATH})`
      : `  Dashboard:                 not built (npm run build:ui)`
  );
});
