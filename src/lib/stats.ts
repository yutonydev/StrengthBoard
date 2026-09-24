import type { WorkoutSet } from '../types';
import { daysBetween } from './dates';

export interface Session {
  date: string;
  sets: WorkoutSet[];
  top: WorkoutSet;
  volume: number;
  isPR: boolean;
}

export interface ExerciseStats {
  sessions: Session[];
  last?: Session;
  prev?: Session;
  heaviest?: WorkoutSet;
  totalSets: number;
  totalVolume: number;
  prSetIds: Set<string>;
}

const EPS = 1e-6;

function bySequence(a: WorkoutSet, b: WorkoutSet): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt;
}

export function newestFirst(sets: WorkoutSet[]): WorkoutSet[] {
  return [...sets].sort((a, b) => bySequence(b, a));
}

export function buildStats(sets: WorkoutSet[]): ExerciseStats {
  const sorted = [...sets].sort(bySequence);
  const sessions: Session[] = [];
  const prSetIds = new Set<string>();
  let heaviestSoFar = -Infinity;
  let heaviest: WorkoutSet | undefined;
  let totalVolume = 0;

  let i = 0;
  while (i < sorted.length) {
    const date = sorted[i].date;
    const group: WorkoutSet[] = [];
    while (i < sorted.length && sorted[i].date === date) group.push(sorted[i++]);

    let top = group[0];
    let volume = 0;
    for (const s of group) {
      volume += s.weight * s.reps;
      if (s.weight > top.weight + EPS || (Math.abs(s.weight - top.weight) <= EPS && s.reps > top.reps)) top = s;
    }
    totalVolume += volume;

    const isPR = sessions.length > 0 && top.weight > heaviestSoFar + EPS;
    if (isPR) prSetIds.add(top.id);
    if (top.weight > heaviestSoFar + EPS) {
      heaviestSoFar = top.weight;
      heaviest = top;
    }
    sessions.push({ date, sets: group, top, volume, isPR });
  }

  return {
    sessions,
    last: sessions[sessions.length - 1],
    prev: sessions[sessions.length - 2],
    heaviest,
    totalSets: sorted.length,
    totalVolume,
    prSetIds,
  };
}

export type Trend = 'up' | 'down' | 'flat';

export function trendOf(sessions: Session[]): Trend {
  if (sessions.length < 2) return 'flat';
  const d = sessions[sessions.length - 1].top.weight - sessions[0].top.weight;
  return d > EPS ? 'up' : d < -EPS ? 'down' : 'flat';
}

export interface Overview {
  trainingDays7: number;
  sets7: number;
  volume7: number;
  prs30: number;
  stale: number;
}

export function overview(sets: WorkoutSet[], stats: Iterable<ExerciseStats>, ref: string): Overview {
  const days = new Set<string>();
  let sets7 = 0;
  let volume7 = 0;
  for (const s of sets) {
    const age = daysBetween(s.date, ref);
    if (age >= 0 && age < 7) {
      days.add(s.date);
      sets7++;
      volume7 += s.weight * s.reps;
    }
  }
  let prs30 = 0;
  let stale = 0;
  for (const st of stats) {
    for (const sess of st.sessions) {
      const age = daysBetween(sess.date, ref);
      if (sess.isPR && age >= 0 && age < 30) prs30++;
    }
    if (st.last && daysBetween(st.last.date, ref) > 14) stale++;
  }
  return { trainingDays7: days.size, sets7, volume7, prs30, stale };
}
