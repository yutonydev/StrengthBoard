import type { Action } from '../store';
import { newId } from '../lib/id';
import type { KeyValueStore } from './local';
import type { RemoteOp } from './ops';

export interface QueueEntry {
  id: string;
  action: Action;
  ops: RemoteOp[];
  attempts: number;
}

export type SendOutcome =
  | { result: 'ok' }
  | { result: 'retry'; message: string }
  | { result: 'auth' }
  | { result: 'reject'; message: string };

export type QueuePhase = 'idle' | 'sending' | 'waiting' | 'paused';

export interface QueueOptions {
  store: KeyValueStore;
  key: string;
  send: (op: RemoteOp) => Promise<SendOutcome>;
  onChange: () => void;
  onSent: (entry: QueueEntry) => void;
  onReject: (entry: QueueEntry, message: string) => void;
  onDrained: (hadRejects: boolean) => void;
}

export function backoff(attempts: number): number {
  return Math.min(2000 * 2 ** Math.max(0, attempts - 1), 60000);
}

function load(store: KeyValueStore, key: string): QueueEntry[] {
  try {
    const raw = store.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

export class SyncQueue {
  phase: QueuePhase = 'idle';
  lastError: string | null = null;
  private opts: QueueOptions;
  private list: QueueEntry[];
  private running = false;
  private paused = false;
  private disposed = false;
  private rejects = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: QueueOptions) {
    this.opts = opts;
    this.list = load(opts.store, opts.key);
  }

  get entries(): readonly QueueEntry[] {
    return this.list;
  }

  get pending(): number {
    return this.list.length;
  }

  enqueue(action: Action, ops: RemoteOp[]): QueueEntry {
    const entry: QueueEntry = { id: newId(), action, ops, attempts: 0 };
    this.list.push(entry);
    this.persist();
    this.opts.onChange();
    this.kick();
    return entry;
  }

  kick(): void {
    if (this.disposed || this.paused) return;
    this.clearTimer();
    void this.drain();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.kick();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private persist(): void {
    try {
      this.opts.store.setItem(this.opts.key, JSON.stringify(this.list));
    } catch {}
  }

  private setPhase(phase: QueuePhase, error: string | null): void {
    this.phase = phase;
    this.lastError = error;
    this.opts.onChange();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.list.length && !this.disposed && !this.paused) {
      const entry = this.list[0];
      this.setPhase('sending', this.lastError);
      let outcome: SendOutcome = { result: 'ok' };
      for (const op of entry.ops) {
        try {
          outcome = await this.opts.send(op);
        } catch (err) {
          outcome = { result: 'retry', message: err instanceof Error ? err.message : String(err) };
        }
        if (outcome.result !== 'ok') break;
      }
      if (this.disposed) break;
      if (outcome.result === 'ok' || outcome.result === 'reject') {
        this.list.shift();
        this.persist();
        this.lastError = null;
        if (outcome.result === 'ok') {
          this.opts.onSent(entry);
        } else {
          this.rejects = true;
          this.opts.onReject(entry, outcome.message);
        }
        this.opts.onChange();
        continue;
      }
      if (outcome.result === 'auth') {
        this.paused = true;
        this.setPhase('paused', null);
        break;
      }
      entry.attempts += 1;
      this.persist();
      this.setPhase('waiting', outcome.message);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.drain();
      }, backoff(entry.attempts));
      break;
    }
    this.running = false;
    if (!this.list.length && !this.disposed) {
      const hadRejects = this.rejects;
      this.rejects = false;
      this.setPhase('idle', null);
      this.opts.onDrained(hadRejects);
    }
  }
}
