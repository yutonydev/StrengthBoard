import { describe, expect, it } from 'vitest';
import { reducer, type Action } from '../store';
import type { AppData, Exercise, WorkoutSet } from '../types';
import { toRemoteOps } from './ops';
import { exerciseToDb, setToDb } from './rows';

const A: Exercise = { id: 'a', name: 'Squat', pinned: true, createdAt: 1_700_000_000_000 };
const B: Exercise = { id: 'b', name: 'Row', category: 'Pull', pinned: false, createdAt: 1_700_000_000_001 };
const S: WorkoutSet = { id: 's1', exerciseId: 'a', date: '2026-09-20', weight: 100, reps: 5, createdAt: 1_700_000_000_002 };
const base: AppData = { version: 1, exercises: [A, B], sets: [S], settings: { unit: 'lb' } };

function ops(action: Action, from: AppData = base) {
  return toRemoteOps(action, reducer(from, action));
}

describe('toRemoteOps', () => {
  it('adds a lift and saves the new order', () => {
    const C: Exercise = { id: 'c', name: 'Dip', pinned: false, createdAt: 1_700_000_000_003 };
    expect(ops({ type: 'addExercise', exercise: C })).toEqual([
      { kind: 'upsertExercises', rows: [exerciseToDb(C, 2)] },
      { kind: 'reorder', ids: ['a', 'b', 'c'] },
    ]);
  });

  it('renames a lift and clears its category', () => {
    expect(ops({ type: 'updateExercise', id: 'b', patch: { name: 'Barbell Row', category: undefined } })).toEqual([
      { kind: 'updateExercise', id: 'b', patch: { name: 'Barbell Row', category: null } },
    ]);
  });

  it('deletes a lift', () => {
    expect(ops({ type: 'deleteExercise', id: 'a' })).toEqual([{ kind: 'deleteExercise', id: 'a' }]);
  });

  it('restores a deleted lift with its sets and order', () => {
    const without = reducer(base, { type: 'deleteExercise', id: 'a' });
    expect(ops({ type: 'restoreExercise', exercise: A, index: 0, sets: [S] }, without)).toEqual([
      { kind: 'upsertExercises', rows: [exerciseToDb(A, 0)] },
      { kind: 'upsertSets', rows: [setToDb(S)] },
      { kind: 'reorder', ids: ['a', 'b'] },
    ]);
  });

  it('pins a lift and saves the new order', () => {
    expect(ops({ type: 'togglePin', id: 'b' })).toEqual([
      { kind: 'updateExercise', id: 'b', patch: { pinned: true } },
      { kind: 'reorder', ids: ['a', 'b'] },
    ]);
  });

  it('saves the order after a drag or move', () => {
    const two: AppData = { ...base, exercises: [A, { ...B, pinned: true }] };
    expect(ops({ type: 'reorder', activeId: 'b', overId: 'a' }, two)).toEqual([{ kind: 'reorder', ids: ['b', 'a'] }]);
    expect(ops({ type: 'move', id: 'a', dir: 1 }, two)).toEqual([{ kind: 'reorder', ids: ['b', 'a'] }]);
  });

  it('adds, restores and deletes sets', () => {
    const S2: WorkoutSet = { ...S, id: 's2', reps: 3 };
    expect(ops({ type: 'addSet', set: S2 })).toEqual([{ kind: 'upsertSets', rows: [setToDb(S2)] }]);
    expect(ops({ type: 'restoreSet', set: S2 })).toEqual([{ kind: 'upsertSets', rows: [setToDb(S2)] }]);
    expect(ops({ type: 'deleteSet', id: 's1' })).toEqual([{ kind: 'deleteSet', id: 's1' }]);
  });

  it('saves the unit and nothing else from settings', () => {
    expect(ops({ type: 'settings', patch: { unit: 'kg' } })).toEqual([{ kind: 'setUnit', unit: 'kg' }]);
    expect(ops({ type: 'settings', patch: {} })).toEqual([]);
  });

  it('replaces the whole board', () => {
    expect(ops({ type: 'replace', data: base })).toEqual([
      { kind: 'replaceBoard', exercises: [exerciseToDb(A, 0), exerciseToDb(B, 1)], sets: [setToDb(S)] },
    ]);
  });
});
