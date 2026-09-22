import { describe, expect, it } from 'vitest';
import type { AppData, Exercise, WorkoutSet } from '../types';
import { buildStats, e1rm, trendOf } from './stats';
import { rankMatches, similarity } from './similarity';
import { fmtAgo, daysBetween } from './dates';
import { fmtSet, fmtWeight, toKg } from './units';
import { emptyData, parseData, reducer } from '../store';
import { uuidV4 } from './id';

let seq = 0;
function set(date: string, lb: number, reps: number): WorkoutSet {
  seq++;
  return { id: `s${seq}`, exerciseId: 'x', date, weight: toKg(lb, 'lb'), reps, createdAt: seq };
}

describe('e1rm', () => {
  it('uses Epley and treats singles as their own max', () => {
    expect(e1rm(200, 1)).toBe(200);
    expect(e1rm(225, 5)).toBeCloseTo(262.5);
  });
});

describe('buildStats', () => {
  const sets = [
    set('2026-09-01', 225, 5),
    set('2026-09-01', 205, 8),
    set('2026-09-04', 230, 5),
    set('2026-09-08', 220, 5),
    set('2026-09-11', 235, 3),
    set('2026-09-15', 230, 6),
  ];
  const st = buildStats(sets);

  it('groups sets into sessions, oldest first', () => {
    expect(st.sessions.map((s) => s.date)).toEqual(['2026-09-01', '2026-09-04', '2026-09-08', '2026-09-11', '2026-09-15']);
    expect(st.sessions[0].sets).toHaveLength(2);
    expect(st.totalSets).toBe(6);
  });

  it('picks the heaviest set as the top set', () => {
    expect(fmtSet(st.sessions[0].top.weight, st.sessions[0].top.reps, 'lb')).toBe('225×5');
  });

  it('flags PR sessions by estimated 1RM, never the first session', () => {
    expect(st.sessions.map((s) => s.isPR)).toEqual([false, true, false, false, true]);
    expect(st.prSetIds.size).toBe(2);
  });

  it('computes trend direction across a window', () => {
    expect(trendOf(st.sessions)).toBe('up');
    expect(trendOf(st.sessions.slice(1, 3))).toBe('down');
    expect(trendOf(st.sessions.slice(0, 1))).toBe('flat');
  });
});

describe('similarity', () => {
  it('treats aliases and case/punctuation variants as duplicates', () => {
    expect(similarity('OHP', 'Overhead Press')).toBe(1);
    expect(similarity('pull-ups', 'Pull Up')).toBe(1);
    expect(similarity('bench press', 'Bench Press')).toBe(1);
  });

  it('finds partial names and typos', () => {
    expect(similarity('Bench', 'Bench Press')).toBeGreaterThanOrEqual(0.75);
    expect(similarity('Sqaut', 'Squat')).toBeGreaterThanOrEqual(0.6);
    expect(similarity('dead', 'Deadlift')).toBeGreaterThanOrEqual(0.5);
  });

  it('does not match unrelated lifts', () => {
    expect(similarity('Leg Curl', 'Bench Press')).toBeLessThan(0.5);
    expect(similarity('Squat', 'Lat Pulldown')).toBeLessThan(0.5);
  });

  it('ranks the closest name first', () => {
    const names = ['Incline Bench Press', 'Bench Press', 'Squat'];
    expect(rankMatches('bench press', names, (n) => n)[0].item).toBe('Bench Press');
  });
});

describe('formatting', () => {
  it('round-trips pounds through kilogram storage', () => {
    expect(fmtWeight(toKg(225, 'lb'), 'lb')).toBe('225');
    expect(fmtWeight(toKg(102.5, 'kg'), 'kg')).toBe('102.5');
    expect(fmtSet(0, 8, 'lb')).toBe('BW×8');
  });

  it('formats time since', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
    expect(fmtAgo('2026-09-22', '2026-09-22')).toBe('Today');
    expect(fmtAgo('2026-09-19', '2026-09-22')).toBe('3d');
    expect(fmtAgo('2026-08-25', '2026-09-22')).toBe('4w');
  });
});

describe('reducer', () => {
  const ex = (id: string, pinned = false): Exercise => ({ id, name: id, pinned, createdAt: 0 });
  const base: AppData = { ...emptyData(), exercises: [ex('A', true), ex('B', true), ex('C'), ex('D')] };
  const order = (s: AppData) => s.exercises.map((e) => e.id).join('');

  it('keeps pinned lifts on top when pinning and unpinning', () => {
    expect(order(reducer(base, { type: 'togglePin', id: 'D' }))).toBe('ABDC');
    expect(order(reducer(base, { type: 'togglePin', id: 'A' }))).toBe('BACD');
  });

  it('reorders only within the same group', () => {
    expect(order(reducer(base, { type: 'reorder', activeId: 'B', overId: 'A' }))).toBe('BACD');
    expect(order(reducer(base, { type: 'reorder', activeId: 'C', overId: 'A' }))).toBe('ABCD');
    expect(order(reducer(base, { type: 'move', id: 'C', dir: 1 }))).toBe('ABDC');
    expect(order(reducer(base, { type: 'move', id: 'C', dir: -1 }))).toBe('ABCD');
  });

  it('deleting an exercise removes its sets; restore puts both back', () => {
    const withSet = reducer(base, { type: 'addSet', set: { ...set('2026-09-01', 100, 5), exerciseId: 'C' } });
    const removed = reducer(withSet, { type: 'deleteExercise', id: 'C' });
    expect(removed.sets).toHaveLength(0);
    const restored = reducer(removed, { type: 'restoreExercise', exercise: ex('C'), index: 2, sets: withSet.sets });
    expect(order(restored)).toBe('ABCD');
    expect(restored.sets).toHaveLength(1);
  });
});

describe('parseData', () => {
  it('drops malformed rows and orphaned sets', () => {
    const data = parseData({
      exercises: [{ id: 'a', name: 'Squat' }, { id: 'b' }],
      sets: [
        { id: '1', exerciseId: 'a', date: '2026-09-01', weight: 100, reps: 5 },
        { id: '2', exerciseId: 'zzz', date: '2026-09-01', weight: 100, reps: 5 },
        { id: '3', exerciseId: 'a', date: 'yesterday', weight: 100, reps: 5 },
        { id: '4', exerciseId: 'a', date: '2026-09-01', weight: -5, reps: 5 },
      ],
      settings: { unit: 'kg' },
    });
    expect(data?.exercises).toHaveLength(1);
    expect(data?.sets.map((s) => s.id)).toEqual(['1']);
    expect(data?.settings).toEqual({ unit: 'kg' });
    expect(parseData('nope')).toBeNull();
  });
});

describe('reducer idempotency', () => {
  const lift: Exercise = { id: 'L', name: 'L', pinned: false, createdAt: 0 };
  const s: WorkoutSet = { id: 'S', exerciseId: 'L', date: '2026-09-01', weight: 50, reps: 5, createdAt: 1 };

  it('ignores adding a lift or set that already exists', () => {
    const once = reducer(reducer(emptyData(), { type: 'addExercise', exercise: lift }), { type: 'addSet', set: s });
    const twice = reducer(reducer(once, { type: 'addExercise', exercise: lift }), { type: 'addSet', set: s });
    expect(twice.exercises).toHaveLength(1);
    expect(twice.sets).toHaveLength(1);
  });

  it('ignores restoring a lift that is already present', () => {
    const base = reducer(emptyData(), { type: 'addExercise', exercise: lift });
    const next = reducer(base, { type: 'restoreExercise', exercise: lift, index: 0, sets: [s] });
    expect(next.exercises).toHaveLength(1);
    expect(next.sets).toHaveLength(0);
  });
});

describe('uuidV4', () => {
  it('formats random bytes as a version 4 UUID', () => {
    const id = uuidV4(new Uint8Array(16).fill(255));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
