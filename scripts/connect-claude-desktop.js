#!/usr/bin/env node
/**
 * One-command Claude Desktop setup. Locates the app's config file for the
 * current OS, backs it up, and merges the Nodus MCP server entry (stdio
 * bridge via mcp-remote — Claude Desktop does not speak SSE directly).
 *
 * Usage:
 *   npm run connect:claude-desktop
 *   npm run connect:claude-desktop -- --url http://localhost:4000/sse
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function configPath() {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      );
    case "win32":
      return path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "Claude",
        "claude_desktop_config.json"
      );
    default:
      return path.join(
        process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
        "Claude",
        "claude_desktop_config.json"
      );
  }
}

const urlFlag = process.argv.indexOf("--url");
const sseUrl =
  urlFlag !== -1
    ? process.argv[urlFlag + 1]
    : `http://localhost:${process.env.NODUS_PORT ?? 3939}/sse`;

try {
  new URL(sseUrl);
} catch {
  fail(`"${sseUrl}" is not a valid URL. Pass e.g. --url http://localhost:3939/sse`);
}

const file = configPath();
let config = {};

if (fs.existsSync(file)) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
    config = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    fail(
      `Your existing config is not valid JSON, so nothing was changed.\n  File: ${file}\n  Fix it (or delete it) and re-run.`
    );
  }
  const backup = `${file}.backup-nodus`;
  fs.copyFileSync(file, backup);
  console.log(`Backed up existing config to ${backup}`);
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  console.log("No existing Claude Desktop config found — creating one.");
}

config.mcpServers = config.mcpServers ?? {};
config.mcpServers.nodus = {
  command: "npx",
  args: ["-y", "mcp-remote", sseUrl],
};

fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");

console.log(`✓ Nodus (${sseUrl}) added to ${file}`);
console.log(
  "\nNow fully quit Claude Desktop (not just the window) and reopen it —\nNodus will appear in the app's tools."
);
