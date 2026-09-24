import type { AppData, Exercise, Unit, WorkoutSet } from '../types';
import { normalize } from '../store';

export interface DbExercise {
  id: string;
  name: string;
  category: string | null;
  pinned: boolean;
  position: number;
  created_at: string;
}

export interface DbSet {
  id: string;
  exercise_id: string;
  date: string;
  weight_kg: number;
  reps: number;
  rir: number | null;
  notes: string | null;
  created_at: string;
}

export function exerciseToDb(e: Exercise, position: number): DbExercise {
  return {
    id: e.id,
    name: e.name,
    category: e.category ?? null,
    pinned: e.pinned,
    position,
    created_at: new Date(e.createdAt).toISOString(),
  };
}

export function setToDb(s: WorkoutSet): DbSet {
  return {
    id: s.id,
    exercise_id: s.exerciseId,
    date: s.date,
    weight_kg: s.weight,
    reps: s.reps,
    rir: s.rir ?? null,
    notes: s.notes ?? null,
    created_at: new Date(s.createdAt).toISOString(),
  };
}

export function exerciseFromDb(r: DbExercise): Exercise {
  const e: Exercise = { id: r.id, name: r.name, pinned: r.pinned, createdAt: Date.parse(r.created_at) };
  if (r.category) e.category = r.category;
  return e;
}

export function setFromDb(r: DbSet): WorkoutSet {
  const s: WorkoutSet = {
    id: r.id,
    exerciseId: r.exercise_id,
    date: r.date,
    weight: Number(r.weight_kg),
    reps: Number(r.reps),
    createdAt: Date.parse(r.created_at),
  };
  if (r.rir !== null && r.rir !== undefined) s.rir = Number(r.rir);
  if (r.notes) s.notes = r.notes;
  return s;
}

export function boardToDb(data: AppData): { exercises: DbExercise[]; sets: DbSet[] } {
  return { exercises: data.exercises.map((e, i) => exerciseToDb(e, i)), sets: data.sets.map(setToDb) };
}

export function boardFromDb(exercises: DbExercise[], sets: DbSet[], unit: Unit): AppData {
  const ordered = [...exercises].sort((a, b) => a.position - b.position || Date.parse(a.created_at) - Date.parse(b.created_at));
  return { version: 1, exercises: normalize(ordered.map(exerciseFromDb)), sets: sets.map(setFromDb), settings: { unit } };
}
