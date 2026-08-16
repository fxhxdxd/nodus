import type { ReactNode } from "react";

interface ToastProps {
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

/** Bottom-centered toast. Mount/unmount is controlled by the parent. */
export default function Toast({ children, actionLabel, onAction }: ToastProps) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-4 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-200 shadow-2xl">
        {children}
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
