import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSet } from '../types';
import { boardFromDb, boardToDb, exerciseFromDb, exerciseToDb, setFromDb, setToDb, type DbExercise, type DbSet } from './rows';

const lift: Exercise = { id: 'b', name: 'Row', category: 'Pull', pinned: false, createdAt: Date.UTC(2026, 8, 1, 10, 0, 0, 123) };
const set: WorkoutSet = { id: 's', exerciseId: 'b', date: '2026-09-02', weight: 81.6466266, reps: 8, createdAt: Date.UTC(2026, 8, 2) };

describe('rows', () => {
  it('maps a lift to a row with its position', () => {
    expect(exerciseToDb(lift, 3)).toEqual({
      id: 'b',
      name: 'Row',
      category: 'Pull',
      pinned: false,
      position: 3,
      created_at: '2026-09-01T10:00:00.123Z',
    });
  });

  it('round-trips lifts and sets without losing anything', () => {
    expect(exerciseFromDb(exerciseToDb(lift, 0))).toEqual(lift);
    expect(setFromDb(setToDb(set))).toEqual(set);
    const full: WorkoutSet = { ...set, rir: 1.5, notes: 'belt' };
    expect(setFromDb(setToDb(full))).toEqual(full);
  });

  it('stores missing optional values as null', () => {
    expect(setToDb(set)).toMatchObject({ rir: null, notes: null, weight_kg: 81.6466266, exercise_id: 'b' });
    expect(exerciseToDb({ ...lift, category: undefined }, 0).category).toBeNull();
  });

  it('accepts numeric columns that arrive as strings', () => {
    const row = { ...setToDb(set), rir: '1.5', weight_kg: '100.25', reps: '5' } as unknown as DbSet;
    expect(setFromDb(row)).toMatchObject({ rir: 1.5, weight: 100.25, reps: 5 });
  });

  it('builds a board ordered by position with pinned lifts first', () => {
    const rows: DbExercise[] = [
      { ...exerciseToDb({ ...lift, id: 'x', pinned: false }, 1) },
      { ...exerciseToDb({ ...lift, id: 'y', pinned: true }, 2) },
      { ...exerciseToDb({ ...lift, id: 'z', pinned: false }, 0) },
    ];
    const board = boardFromDb(rows, [setToDb(set)], 'kg');
    expect(board.exercises.map((e) => e.id)).toEqual(['y', 'z', 'x']);
    expect(board.settings).toEqual({ unit: 'kg' });
    expect(board.sets).toEqual([set]);
  });

  it('writes a whole board with positions from its order', () => {
    const board = boardFromDb([exerciseToDb(lift, 0)], [setToDb(set)], 'lb');
    expect(boardToDb(board)).toEqual({ exercises: [exerciseToDb(lift, 0)], sets: [setToDb(set)] });
  });
});
