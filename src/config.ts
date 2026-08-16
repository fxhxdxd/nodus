/**
 * Central runtime configuration. All environment overrides live here so the
 * rest of the codebase never reads process.env directly.
 */

import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

/** HTTP port for MCP endpoints, REST API, and the dashboard. */
export const PORT = Number(process.env.NODUS_PORT ?? 3939);

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
