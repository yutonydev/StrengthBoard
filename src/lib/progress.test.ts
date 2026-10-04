import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSet } from '../types';
import { buildStats, type ExerciseStats } from './stats';
import { liftProgress, mondayOf, trainingCalendar, weekStreaks } from './progress';

let seq = 0;
function set(exerciseId: string, date: string, weight: number, reps = 5): WorkoutSet {
  seq++;
  return { id: `s${seq}`, exerciseId, date, weight, reps, createdAt: seq };
}

describe('mondayOf', () => {
  it('finds the Monday that starts the week', () => {
    expect(mondayOf('2026-10-04')).toBe('2026-09-28');
    expect(mondayOf('2026-09-28')).toBe('2026-09-28');
    expect(mondayOf('2026-10-01')).toBe('2026-09-28');
  });
});

describe('trainingCalendar', () => {
  const sets = [set('a', '2026-10-01', 100), set('a', '2026-10-01', 90), set('b', '2026-10-01', 50), set('a', '2026-09-29', 100)];
  const names = new Map([
    ['a', 'Squat'],
    ['b', 'Row'],
  ]);
  const cal = trainingCalendar(sets, names, '2026-10-04', 4);

  it('lays out whole weeks from Monday, ending with the current week', () => {
    expect(cal.weeks).toHaveLength(4);
    expect(cal.weeks[3].days[0]?.date).toBe('2026-09-28');
    expect(cal.weeks[3].days[6]?.date).toBe('2026-10-04');
    expect(cal.weeks[0].days[0]?.date).toBe('2026-09-07');
  });

  it('counts sets and names the lifts trained each day', () => {
    const thu = cal.weeks[3].days[3]!;
    expect(thu.sets).toBe(3);
    expect(thu.lifts).toEqual(['Squat', 'Row']);
    expect(thu.level).toBe(4);
    expect(cal.weeks[3].days[1]!.level).toBe(2);
    expect(cal.weeks[3].days[0]!.level).toBe(0);
    expect(cal.trainingDays).toBe(2);
  });

  it('leaves days after today empty', () => {
    const later = trainingCalendar([], names, '2026-10-01', 1);
    expect(later.weeks[0].days.slice(4)).toEqual([null, null, null]);
  });
});

describe('weekStreaks', () => {
  it('counts consecutive training weeks', () => {
    const dates = ['2026-09-08', '2026-09-15', '2026-09-23', '2026-10-01', '2026-08-03', '2026-08-10'];
    expect(weekStreaks(dates, '2026-10-04')).toEqual({ current: 4, longest: 4 });
  });

  it('keeps the streak alive until the current week ends', () => {
    expect(weekStreaks(['2026-09-22', '2026-09-15'], '2026-10-01').current).toBe(2);
  });

  it('breaks after a full empty week', () => {
    expect(weekStreaks(['2026-09-15'], '2026-10-04')).toEqual({ current: 0, longest: 1 });
  });

  it('handles no training at all', () => {
    expect(weekStreaks([], '2026-10-04')).toEqual({ current: 0, longest: 0 });
  });
});

describe('liftProgress', () => {
  const squat: Exercise = { id: 'a', name: 'Squat', pinned: true, createdAt: 0 };
  const row: Exercise = { id: 'b', name: 'Row', pinned: false, createdAt: 0 };
  const curl: Exercise = { id: 'c', name: 'Curl', pinned: false, createdAt: 0 };
  const stats = new Map<string, ExerciseStats>([
    ['a', buildStats([set('a', '2026-07-01', 100), set('a', '2026-08-01', 120), set('a', '2026-09-01', 115)])],
    ['b', buildStats([set('b', '2026-07-01', 60), set('b', '2026-09-01', 80)])],
    ['c', buildStats([set('c', '2026-09-01', 20)])],
  ]);

  it('measures each lift from its first top set to its best', () => {
    const [first, second] = liftProgress([squat, row, curl], stats);
    expect(first.exercise.name).toBe('Row');
    expect(first.gain).toBe(20);
    expect(first.pct).toBeCloseTo(33.33, 1);
    expect(second.exercise.name).toBe('Squat');
    expect(second.best.weight).toBe(120);
    expect(second.since).toBe('2026-07-01');
  });

  it('skips lifts with only one session', () => {
    expect(liftProgress([squat, row, curl], stats).map((p) => p.exercise.id)).not.toContain('c');
  });
});
