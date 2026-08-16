import { PenLine, Radio, Trash2, Upload } from "lucide-react";
import { timeAgo } from "../lib/format";
import { useActivity } from "../lib/hooks";
import type { ActivityEvent } from "../lib/types";

const EVENT_STYLE: Record<
  ActivityEvent["type"],
  { icon: typeof PenLine; tint: string; verb: string }
> = {
  write: { icon: PenLine, tint: "text-cyan-400", verb: "wrote" },
  delete: { icon: Trash2, tint: "text-red-400", verb: "deleted" },
  import: { icon: Upload, tint: "text-emerald-400", verb: "imported" },
};

function EventRow({ event }: { event: ActivityEvent }) {
  const style = EVENT_STYLE[event.type];
  const Icon = style.icon;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`mt-0.5 rounded-lg bg-neutral-800/80 p-1.5 ${style.tint}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-neutral-200">
          <span className="font-medium text-neutral-100">{event.by}</span>{" "}
          {style.verb}{" "}
          <span className="font-mono text-xs text-cyan-300">
            {event.type === "import" ? event.key : `${event.domain}/${event.key}`}
          </span>
        </div>
        {event.preview && (
          <div className="mt-0.5 truncate text-xs text-neutral-500">
            “{event.preview}”
          </div>
        )}
      </div>
      <div
        className="shrink-0 text-xs text-neutral-600"
        title={new Date(event.at).toLocaleString()}
      >
        {timeAgo(event.at)}
      </div>
    </div>
  );
}

export default function ActivityView() {
  const events = useActivity();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
            Activity
          </h1>
          <p className="mt-1.5 text-sm text-neutral-400">
            Every write to the shared memory, as it happens.
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
          <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
          live
        </span>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/30">
        {events.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-neutral-500">
            Quiet so far. Ask a connected AI tool to save something to nodus
            and it will appear here instantly.
            <div className="mt-1 text-xs text-neutral-600">
              (The feed shows activity since the server last started.)
            </div>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/70">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
