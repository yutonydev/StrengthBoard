import type { Exercise, WorkoutSet } from '../types';
import type { ExerciseStats } from './stats';
import { addDays, daysBetween } from './dates';

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface CalendarDay {
  date: string;
  sets: number;
  lifts: string[];
  level: HeatLevel;
}

export interface CalendarWeek {
  start: string;
  days: (CalendarDay | null)[];
}

export interface TrainingCalendar {
  weeks: CalendarWeek[];
  trainingDays: number;
  totalSets: number;
}

export interface LiftProgress {
  exercise: Exercise;
  first: WorkoutSet;
  best: WorkoutSet;
  gain: number;
  pct: number;
  sessions: number;
  since: string;
}

export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const offset = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(iso, -offset);
}

export function trainingCalendar(sets: WorkoutSet[], names: Map<string, string>, end: string, weeks = 26): TrainingCalendar {
  const lastMonday = mondayOf(end);
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));
  const byDate = new Map<string, { sets: number; lifts: string[] }>();

  for (const s of sets) {
    if (s.date < firstMonday || s.date > end) continue;
    const entry = byDate.get(s.date) ?? { sets: 0, lifts: [] };
    entry.sets += 1;
    const name = names.get(s.exerciseId);
    if (name && !entry.lifts.includes(name)) entry.lifts.push(name);
    byDate.set(s.date, entry);
  }

  const max = Math.max(0, ...Array.from(byDate.values(), (e) => e.sets));
  const level = (n: number): HeatLevel => (n === 0 || max === 0 ? 0 : (Math.max(1, Math.ceil((4 * n) / max)) as HeatLevel));

  const out: CalendarWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(firstMonday, 7 * w);
    const days: (CalendarDay | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, d);
      if (date > end) {
        days.push(null);
        continue;
      }
      const entry = byDate.get(date);
      days.push({ date, sets: entry?.sets ?? 0, lifts: entry?.lifts ?? [], level: level(entry?.sets ?? 0) });
    }
    out.push({ start, days });
  }

  let totalSets = 0;
  for (const e of byDate.values()) totalSets += e.sets;
  return { weeks: out, trainingDays: byDate.size, totalSets };
}

export function weekStreaks(dates: string[], today: string): { current: number; longest: number } {
  const weeks = new Set(dates.map(mondayOf));
  if (weeks.size === 0) return { current: 0, longest: 0 };

  const sorted = [...weeks].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 7 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  let cursor = mondayOf(today);
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  let current = 0;
  while (weeks.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -7);
  }
  return { current, longest };
}

export function liftProgress(exercises: Exercise[], statsById: Map<string, ExerciseStats>): LiftProgress[] {
  const out: LiftProgress[] = [];
  for (const exercise of exercises) {
    const stats = statsById.get(exercise.id);
    if (!stats || stats.sessions.length < 2 || !stats.heaviest) continue;
    const first = stats.sessions[0].top;
    const best = stats.heaviest;
    const gain = best.weight - first.weight;
    out.push({
      exercise,
      first,
      best,
      gain,
      pct: first.weight > 0 ? (gain / first.weight) * 100 : 0,
      sessions: stats.sessions.length,
      since: stats.sessions[0].date,
    });
  }
  return out.sort((a, b) => b.pct - a.pct || b.gain - a.gain);
}
