#!/usr/bin/env node
/**
 * Generates MCP client configuration files for the local Nodus server.
 *
 *   .cursor/mcp.json                     Cursor (native SSE, picked up
 *                                        automatically for this workspace)
 *   examples/claude_desktop_config.json  Claude Desktop (stdio bridge via
 *                                        mcp-remote; merge into the app's
 *                                        own config file)
 *
 * Claude Code and Codex register via one-liners printed at the end.
 *
 * Usage:  npm run generate-configs [-- --port 3939]
 */

const fs = require("fs");
const path = require("path");

const portFlag = process.argv.indexOf("--port");
const PORT =
  portFlag !== -1
    ? Number(process.argv[portFlag + 1])
    : Number(process.env.NODUS_PORT ?? 3939);

const SSE_URL = `http://localhost:${PORT}/sse`;
const MCP_URL = `http://localhost:${PORT}/mcp`;
const ROOT = path.join(__dirname, "..");

function writeJson(relPath, data) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${relPath}`);
}

writeJson(".cursor/mcp.json", {
  mcpServers: { nodus: { url: SSE_URL } },
});

writeJson("examples/claude_desktop_config.json", {
  mcpServers: {
    nodus: { command: "npx", args: ["-y", "mcp-remote", SSE_URL] },
  },
});

console.log(`
Register the CLI clients directly:

  Claude Code:  claude mcp add --transport sse nodus ${SSE_URL}
  Codex:        codex mcp add nodus --url ${MCP_URL}
`);
