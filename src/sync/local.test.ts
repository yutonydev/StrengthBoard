import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { cacheKey, clearUser, memoryStore, queueKey, readCache, replay, writeCache } from './local';

const board: AppData = {
  version: 1,
  exercises: [{ id: 'a', name: 'Squat', pinned: true, createdAt: 1 }],
  sets: [{ id: 's', exerciseId: 'a', date: '2026-09-20', weight: 100, reps: 5, createdAt: 2 }],
  settings: { unit: 'kg' },
};

describe('board cache', () => {
  it('keeps one cache per user', () => {
    const store = memoryStore();
    writeCache(store, 'u1', board);
    expect(readCache(store, 'u1')).toEqual(board);
    expect(readCache(store, 'u2')).toBeNull();
  });

  it('treats a corrupt cache as missing', () => {
    const store = memoryStore();
    store.setItem(cacheKey('u1'), '{not json');
    expect(readCache(store, 'u1')).toBeNull();
  });

  it('clears a user’s cache and queue', () => {
    const store = memoryStore();
    writeCache(store, 'u1', board);
    store.setItem(queueKey('u1'), '[]');
    clearUser(store, 'u1');
    expect(store.getItem(cacheKey('u1'))).toBeNull();
    expect(store.getItem(queueKey('u1'))).toBeNull();
  });
});

describe('replay', () => {
  it('applies pending actions on top of the server board', () => {
    const next = replay(board, [
      { type: 'addSet', set: { id: 't', exerciseId: 'a', date: '2026-09-21', weight: 105, reps: 3, createdAt: 3 } },
      { type: 'settings', patch: { unit: 'lb' } },
    ]);
    expect(next.sets.map((s) => s.id)).toEqual(['s', 't']);
    expect(next.settings.unit).toBe('lb');
  });

  it('does not duplicate a set the server already has', () => {
    expect(replay(board, [{ type: 'addSet', set: board.sets[0] }]).sets).toHaveLength(1);
  });
});
