/**
 * Central runtime configuration. All environment overrides live here so the
 * rest of the codebase never reads process.env directly.
 */

import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

const DEFAULT_PORT = 3939;

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`NODUS_PORT must be an integer in 1-65535, got "${raw}"`);
  }
  return port;
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

function parseLogLevel(raw: string | undefined): (typeof LOG_LEVELS)[number] {
  if (raw === undefined) return "info";
  const level = raw.toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    throw new Error(`NODUS_LOG_LEVEL must be one of ${LOG_LEVELS.join("|")}, got "${raw}"`);
  }
  return level as (typeof LOG_LEVELS)[number];
}

/** HTTP port for MCP endpoints, REST API, and the dashboard. */
export const PORT = parsePort(process.env.NODUS_PORT);

/** Minimum level emitted by the logger. */
export const LOG_LEVEL = parseLogLevel(process.env.NODUS_LOG_LEVEL);

/** Directory holding the SQLite database (created on boot). */
const DATA_DIR = process.env.NODUS_DATA_DIR ?? path.join(PROJECT_ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

/** SQLite database file. */
export const DB_PATH = process.env.NODUS_DB_PATH ?? path.join(DATA_DIR, "nodus.db");

/**
 * Built dashboard assets. Probed because __dirname differs between the tsx
 * runtime (src/) and a compiled build (dist/src/). Undefined until the UI
 * has been built once.
 */
export const UI_DIST_PATH: string | undefined = [
  path.join(PROJECT_ROOT, "ui", "dist"),
  path.join(PROJECT_ROOT, "..", "ui", "dist"),
].find((p) => fs.existsSync(p));
