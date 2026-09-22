import { AlertTriangle, CloudCheck, CloudOff, RefreshCw, type LucideIcon } from 'lucide-react';
import type { SyncState } from '../sync/useSyncedStore';

function describe({ pending, phase, online }: SyncState): { Icon: LucideIcon; label: string; warn: boolean; spin: boolean } {
  if (!online) return { Icon: CloudOff, label: pending > 0 ? `Offline · ${pending} waiting` : 'Offline', warn: pending > 0, spin: false };
  if (phase === 'paused') return { Icon: AlertTriangle, label: 'Reconnecting to your account', warn: true, spin: false };
  if (phase === 'waiting') return { Icon: AlertTriangle, label: 'Couldn’t save · retrying', warn: true, spin: false };
  if (pending > 0 || phase === 'sending') return { Icon: RefreshCw, label: 'Saving…', warn: false, spin: true };
  return { Icon: CloudCheck, label: 'Saved', warn: false, spin: false };
}

export function SyncStatus({ sync }: { sync: SyncState }) {
  const { Icon, label, warn, spin } = describe(sync);
  return (
    <span
      role="status"
      aria-live="polite"
      title={sync.error ?? label}
      className={`mr-1 inline-flex items-center gap-1.5 text-xs ${warn ? 'text-warn' : 'text-muted'}`}
    >
      <Icon size={14} aria-hidden="true" className={spin ? 'animate-spin motion-reduce:animate-none' : undefined} />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}
