/**
 * Minimal structured, level-based logger. Zero dependencies by design — the
 * output is one line per event: ISO timestamp, level, message, and optional
 * JSON metadata. Level threshold comes from config (NODUS_LOG_LEVEL).
 */

import { LOG_LEVEL } from "./config";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

type Meta = Record<string, unknown>;

function emit(level: LogLevel, message: string, meta?: Meta): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[LOG_LEVEL]) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  if (level === "error") {
    console.error(line + suffix);
  } else if (level === "warn") {
    console.warn(line + suffix);
  } else {
    console.log(line + suffix);
  }
}

export const logger = {
  debug: (message: string, meta?: Meta): void => emit("debug", message, meta),
  info: (message: string, meta?: Meta): void => emit("info", message, meta),
  warn: (message: string, meta?: Meta): void => emit("warn", message, meta),
  error: (message: string, meta?: Meta): void => emit("error", message, meta),
};

/** Extract a safe, loggable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
