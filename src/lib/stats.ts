import type { WorkoutSet } from '../types';
import { daysBetween } from './dates';

export function e1rm(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

export interface Session {
  date: string;
  sets: WorkoutSet[];
  top: WorkoutSet;
  best: WorkoutSet;
  bestE1rm: number;
  volume: number;
  isPR: boolean;
}

export interface ExerciseStats {
  sessions: Session[];
  last?: Session;
  prev?: Session;
  bestE1rm: number;
  bestE1rmSession?: Session;
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
  let runningBest = -Infinity;
  let heaviest: WorkoutSet | undefined;
  let totalVolume = 0;

  let i = 0;
  while (i < sorted.length) {
    const date = sorted[i].date;
    const group: WorkoutSet[] = [];
    while (i < sorted.length && sorted[i].date === date) group.push(sorted[i++]);

    let top = group[0];
    let best = group[0];
    let bestE = e1rm(best.weight, best.reps);
    let volume = 0;
    for (const s of group) {
      volume += s.weight * s.reps;
      if (s.weight > top.weight + EPS || (Math.abs(s.weight - top.weight) <= EPS && s.reps > top.reps)) top = s;
      const e = e1rm(s.weight, s.reps);
      if (e > bestE + EPS) {
        best = s;
        bestE = e;
      }
      if (!heaviest || s.weight > heaviest.weight + EPS) heaviest = s;
    }
    totalVolume += volume;

    const isPR = sessions.length > 0 && bestE > runningBest + EPS;
    if (isPR) prSetIds.add(best.id);
    runningBest = Math.max(runningBest, bestE);
    sessions.push({ date, sets: group, top, best, bestE1rm: bestE, volume, isPR });
  }

  let bestE1rmSession: Session | undefined;
  for (const s of sessions) {
    if (!bestE1rmSession || s.bestE1rm > bestE1rmSession.bestE1rm + EPS) bestE1rmSession = s;
  }

  return {
    sessions,
    last: sessions[sessions.length - 1],
    prev: sessions[sessions.length - 2],
    bestE1rm: bestE1rmSession?.bestE1rm ?? 0,
    bestE1rmSession,
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
