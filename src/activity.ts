/**
 * In-memory activity feed. Records writes/deletes/imports as they happen,
 * keeps the most recent events in a ring buffer, and notifies subscribers
 * (the /api/activity/stream SSE endpoint) in real time.
 */

const MAX_EVENTS = 100;
const PREVIEW_LENGTH = 80;

export interface ActivityEvent {
  id: number;
  type: "write" | "delete" | "import";
  domain: string;
  key: string;
  /** Who did it: MCP clientInfo name, "dashboard", or "import". */
  by: string;
  /** First characters of the value involved (empty for deletes). */
  preview: string;
  at: string;
}

type Listener = (event: ActivityEvent) => void;

const events: ActivityEvent[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

export function recordActivity(
  input: Omit<ActivityEvent, "id" | "at" | "preview"> & { preview?: string }
): void {
  const event: ActivityEvent = {
    id: nextId++,
    type: input.type,
    domain: input.domain,
    key: input.key,
    by: input.by,
    preview: (input.preview ?? "").slice(0, PREVIEW_LENGTH),
    at: new Date().toISOString(),
  };
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  for (const listener of listeners) listener(event);
}

/** Recent events, newest first. */
export function recentActivity(): ActivityEvent[] {
  return [...events].reverse();
}

/** Subscribe to new events. Returns an unsubscribe function. */
export function onActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
