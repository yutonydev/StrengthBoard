import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '../store';
import { memoryStore } from './local';
import type { RemoteOp } from './ops';
import { SyncQueue, backoff, type SendOutcome } from './queue';

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const op = (id: string): RemoteOp => ({ kind: 'deleteSet', id });
const act = (id: string): Action => ({ type: 'deleteSet', id });
const idOf = (a: Action) => (a as { id: string }).id;

function harness(send: (op: RemoteOp) => Promise<SendOutcome>) {
  const store = memoryStore();
  const sent: string[] = [];
  const rejected: string[] = [];
  const drained: boolean[] = [];
  const make = () =>
    new SyncQueue({
      store,
      key: 'q',
      send,
      onChange: () => {},
      onSent: (e) => sent.push(idOf(e.action)),
      onReject: (e, message) => rejected.push(`${idOf(e.action)}:${message}`),
      onDrained: (hadRejects) => drained.push(hadRejects),
    });
  return { store, sent, rejected, drained, make };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('backoff', () => {
  it('doubles from two seconds and caps at a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoff)).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });
});

describe('SyncQueue', () => {
  it('sends entries in order and reports when drained', async () => {
    const calls: string[] = [];
    const h = harness(async (o) => {
      calls.push((o as { id: string }).id);
      return { result: 'ok' };
    });
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    q.enqueue(act('b'), [op('b')]);
    await flush();
    expect(calls).toEqual(['a', 'b']);
    expect(h.sent).toEqual(['a', 'b']);
    expect(q.pending).toBe(0);
    expect(q.phase).toBe('idle');
    expect(h.drained).toEqual([false]);
  });

  it('keeps unsent entries in storage across a restart', async () => {
    const h = harness(async () => ({ result: 'retry', message: 'offline' }));
    const first = h.make();
    first.enqueue(act('a'), [op('a')]);
    await flush();
    first.dispose();
    const second = h.make();
    expect(second.entries.map((e) => idOf(e.action))).toEqual(['a']);
    expect(second.entries[0].attempts).toBe(1);
    second.dispose();
  });

  it('retries after the backoff delay', async () => {
    let fail = true;
    const h = harness(async () => (fail ? { result: 'retry', message: 'offline' } : { result: 'ok' }));
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    await flush();
    expect(q.phase).toBe('waiting');
    expect(q.lastError).toBe('offline');
    fail = false;
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(h.sent).toEqual(['a']);
    expect(q.phase).toBe('idle');
  });

  it('retries immediately when kicked', async () => {
    let fail = true;
    const h = harness(async () => (fail ? { result: 'retry', message: 'offline' } : { result: 'ok' }));
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    await flush();
    fail = false;
    q.kick();
    await flush();
    expect(h.sent).toEqual(['a']);
  });

  it('treats a thrown send as retryable', async () => {
    const h = harness(async () => {
      throw new Error('boom');
    });
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    await flush();
    expect(q.phase).toBe('waiting');
    expect(q.lastError).toBe('boom');
    expect(q.pending).toBe(1);
    q.dispose();
  });

  it('drops a rejected entry, reports it and keeps going', async () => {
    const h = harness(async (o) => ((o as { id: string }).id === 'a' ? { result: 'reject', message: 'bad' } : { result: 'ok' }));
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    q.enqueue(act('b'), [op('b')]);
    await flush();
    expect(h.rejected).toEqual(['a:bad']);
    expect(h.sent).toEqual(['b']);
    expect(h.drained).toEqual([true]);
  });

  it('pauses on an auth failure until resumed', async () => {
    let auth = true;
    const h = harness(async () => (auth ? { result: 'auth' } : { result: 'ok' }));
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    await flush();
    expect(q.phase).toBe('paused');
    q.kick();
    await flush();
    expect(h.sent).toEqual([]);
    auth = false;
    q.resume();
    await flush();
    expect(h.sent).toEqual(['a']);
  });

  it('only removes an entry once every one of its ops succeeds', async () => {
    const calls: string[] = [];
    let failSecond = true;
    const h = harness(async (o) => {
      const id = (o as { id: string }).id;
      calls.push(id);
      if (id === 'a2' && failSecond) {
        failSecond = false;
        return { result: 'retry', message: 'blip' };
      }
      return { result: 'ok' };
    });
    const q = h.make();
    q.enqueue(act('a'), [op('a1'), op('a2')]);
    await flush();
    expect(q.pending).toBe(1);
    q.kick();
    await flush();
    expect(calls).toEqual(['a1', 'a2', 'a1', 'a2']);
    expect(h.sent).toEqual(['a']);
  });
});
