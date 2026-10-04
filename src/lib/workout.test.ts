import { describe, expect, it } from 'vitest';
import { buildStats } from './stats';
import { toKg } from './units';
import { blankSet, checkSet, draftProblems, draftToSets, draftTotals, repeatSet, type WorkoutDraft } from './workout';

const history = buildStats([
  { id: 'a', exerciseId: 'sq', date: '2026-09-28', weight: toKg(275, 'lb'), reps: 5, createdAt: 1 },
  { id: 'b', exerciseId: 'sq', date: '2026-10-01', weight: toKg(285, 'lb'), reps: 3, createdAt: 2 },
]);

describe('blankSet', () => {
  it('prefills the last session’s top set in the display unit', () => {
    expect(blankSet(history, 'lb')).toMatchObject({ weight: '285', reps: '3', rir: '' });
  });

  it('starts empty for a lift with no history', () => {
    expect(blankSet(undefined, 'lb')).toMatchObject({ weight: '', reps: '', rir: '' });
  });

  it('repeats a set with a new key', () => {
    const first = blankSet(history, 'lb');
    const again = repeatSet({ ...first, rir: '2' });
    expect(again).toMatchObject({ weight: '285', reps: '3', rir: '2' });
    expect(again.key).not.toBe(first.key);
  });
});

describe('checkSet', () => {
  it('accepts a normal set and a bodyweight set', () => {
    expect(checkSet({ key: 'k', weight: '225', reps: '5', rir: '' })).toEqual({});
    expect(checkSet({ key: 'k', weight: '0', reps: '12', rir: '0' })).toEqual({});
  });

  it('flags each bad field', () => {
    expect(checkSet({ key: 'k', weight: '', reps: '0', rir: '11' })).toEqual({ weight: true, reps: true, rir: true });
    expect(checkSet({ key: 'k', weight: '100', reps: '2.5', rir: '' })).toEqual({ reps: true });
  });
});

describe('draft conversion', () => {
  const draft: WorkoutDraft = {
    date: '2026-10-04',
    lifts: [
      {
        exerciseId: 'sq',
        sets: [
          { key: '1', weight: '285', reps: '3', rir: '1' },
          { key: '2', weight: '245', reps: '8', rir: '' },
        ],
      },
      { exerciseId: 'row', sets: [{ key: '3', weight: '185', reps: '6', rir: '' }] },
      { exerciseId: 'dip', sets: [] },
    ],
  };

  it('counts lifts, sets and volume', () => {
    const totals = draftTotals(draft, 'lb');
    expect(totals.lifts).toBe(2);
    expect(totals.sets).toBe(3);
    expect(totals.volume).toBeCloseTo(toKg(285 * 3 + 245 * 8 + 185 * 6, 'lb'));
  });

  it('turns the draft into sets on one date, in the order entered', () => {
    const sets = draftToSets(draft, 'lb', 1000);
    expect(sets.map((s) => [s.exerciseId, s.reps, s.createdAt])).toEqual([
      ['sq', 3, 1000],
      ['sq', 8, 1001],
      ['row', 6, 1002],
    ]);
    expect(sets.every((s) => s.date === '2026-10-04')).toBe(true);
    expect(sets[0].weight).toBeCloseTo(toKg(285, 'lb'));
    expect(sets[0].rir).toBe(1);
    expect(sets[1].rir).toBeUndefined();
  });

  it('counts sets that still need fixing', () => {
    expect(draftProblems(draft)).toBe(0);
    const broken: WorkoutDraft = { ...draft, lifts: [{ exerciseId: 'sq', sets: [{ key: 'x', weight: 'abc', reps: '5', rir: '' }] }] };
    expect(draftProblems(broken)).toBe(1);
  });
});
