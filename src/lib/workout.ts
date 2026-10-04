import type { Unit, WorkoutSet } from '../types';
import type { ExerciseStats } from './stats';
import { newId } from './id';
import { fmtNum, fromKg, toKg } from './units';

export interface DraftSet {
  key: string;
  weight: string;
  reps: string;
  rir: string;
}

export interface DraftLift {
  exerciseId: string;
  sets: DraftSet[];
}

export interface WorkoutDraft {
  date: string;
  lifts: DraftLift[];
}

export interface SetErrors {
  weight?: boolean;
  reps?: boolean;
  rir?: boolean;
}

export function blankSet(stats: ExerciseStats | undefined, unit: Unit): DraftSet {
  const top = stats?.last?.top;
  return {
    key: newId(),
    weight: top ? fmtNum(fromKg(top.weight, unit)) : '',
    reps: top ? String(top.reps) : '',
    rir: '',
  };
}

export function repeatSet(previous: DraftSet): DraftSet {
  return { ...previous, key: newId() };
}

export function checkSet(s: DraftSet): SetErrors {
  const errors: SetErrors = {};
  const weight = s.weight.trim() === '' ? NaN : Number(s.weight);
  const reps = Number(s.reps);
  const rir = s.rir.trim() === '' ? null : Number(s.rir);
  if (!Number.isFinite(weight) || weight < 0 || weight > 2000) errors.weight = true;
  if (!Number.isInteger(reps) || reps < 1 || reps > 100) errors.reps = true;
  if (rir !== null && (!Number.isFinite(rir) || rir < 0 || rir > 10)) errors.rir = true;
  return errors;
}

function isValid(s: DraftSet): boolean {
  const e = checkSet(s);
  return !e.weight && !e.reps && !e.rir;
}

export function draftProblems(draft: WorkoutDraft): number {
  return draft.lifts.reduce((n, lift) => n + lift.sets.filter((s) => !isValid(s)).length, 0);
}

export function draftTotals(draft: WorkoutDraft, unit: Unit): { lifts: number; sets: number; volume: number } {
  let sets = 0;
  let volume = 0;
  let lifts = 0;
  for (const lift of draft.lifts) {
    const valid = lift.sets.filter(isValid);
    if (valid.length) lifts += 1;
    sets += valid.length;
    for (const s of valid) volume += toKg(Number(s.weight), unit) * Number(s.reps);
  }
  return { lifts, sets, volume };
}

export function draftToSets(draft: WorkoutDraft, unit: Unit, now: number): WorkoutSet[] {
  const out: WorkoutSet[] = [];
  for (const lift of draft.lifts) {
    for (const s of lift.sets) {
      if (!isValid(s)) continue;
      const set: WorkoutSet = {
        id: newId(),
        exerciseId: lift.exerciseId,
        date: draft.date,
        weight: toKg(Number(s.weight), unit),
        reps: Number(s.reps),
        createdAt: now + out.length,
      };
      if (s.rir.trim() !== '') set.rir = Number(s.rir);
      out.push(set);
    }
  }
  return out;
}
