import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message: string, undo?: () => void) => {
    const id = next.current++;
    setToasts([{ id, message, undo }]);
  }, []);
  return { toasts, push, dismiss };
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => dismissRef.current(), toast.undo ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [paused, toast]);

  return (
    <div
      className="animate-toast pointer-events-auto flex min-h-11 items-center gap-3 rounded-lg border border-line-strong bg-surface-3 py-1.5 pr-1.5 pl-3.5 text-sm text-fg shadow-pop"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            toast.undo?.();
            onDismiss();
          }}
          className="btn h-8 px-2.5 font-semibold text-accent-text hover:bg-surface-4"
        >
          Undo
        </button>
      )}
      <button type="button" onClick={onDismiss} className="icon-btn size-8 sm:size-8" aria-label="Dismiss notification">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
