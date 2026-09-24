import type { AppData, Exercise, Settings, WorkoutSet } from '../types';
import { addDays, today } from './dates';
import { newId } from './id';
import { toKg } from './units';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Plan {
  name: string;
  category: string;
  pinned?: boolean;
  days: number[];
  start: number;
  end: number;
  inc: number;
  reps: number[];
  backoffReps: number;
  backoffSets: number;
  stopDaysAgo?: number;
  fadeAtEnd?: number;
}

const PLANS: Plan[] = [
  { name: 'Squat', category: 'Legs', pinned: true, days: [1, 4], start: 245, end: 290, inc: 5, reps: [5, 5, 3, 5, 4], backoffReps: 8, backoffSets: 2 },
  { name: 'Bench Press', category: 'Push', pinned: true, days: [2, 5], start: 185, end: 215, inc: 5, reps: [5, 3, 5, 4, 3], backoffReps: 8, backoffSets: 3 },
  { name: 'Deadlift', category: 'Pull', pinned: true, days: [3], start: 325, end: 375, inc: 10, reps: [5, 3, 3, 5], backoffReps: 5, backoffSets: 1 },
  { name: 'Overhead Press', category: 'Push', pinned: true, days: [1, 4], start: 115, end: 135, inc: 5, reps: [5, 5, 4, 3], backoffReps: 8, backoffSets: 2, fadeAtEnd: 10 },
  { name: 'Barbell Row', category: 'Pull', days: [2, 5], start: 155, end: 180, inc: 5, reps: [8, 8, 6], backoffReps: 10, backoffSets: 2 },
  { name: 'Weighted Pull-up', category: 'Pull', days: [3, 6], start: 10, end: 35, inc: 5, reps: [6, 5, 6, 4], backoffReps: 8, backoffSets: 2 },
  { name: 'Romanian Deadlift', category: 'Legs', days: [4], start: 225, end: 255, inc: 10, reps: [8, 8, 6], backoffReps: 10, backoffSets: 2 },
  { name: 'Incline Dumbbell Press', category: 'Push', days: [2, 5], start: 60, end: 72.5, inc: 2.5, reps: [10, 8, 10, 9], backoffReps: 12, backoffSets: 2 },
  { name: 'Leg Press', category: 'Legs', days: [1], start: 360, end: 410, inc: 10, reps: [12, 10, 12], backoffReps: 15, backoffSets: 1, stopDaysAgo: 20 },
  { name: 'Lateral Raise', category: 'Push', days: [2, 6], start: 20, end: 25, inc: 2.5, reps: [15, 12, 15], backoffReps: 15, backoffSets: 2, fadeAtEnd: 5 },
];

const HISTORY_DAYS = 84;

export function sampleData(settings: Settings): AppData {
  const rand = mulberry32(7);
  const ref = today();
  const now = Date.now();
  const exercises: Exercise[] = [];
  const sets: WorkoutSet[] = [];

  PLANS.forEach((plan, index) => {
    const exercise: Exercise = {
      id: newId(),
      name: plan.name,
      category: plan.category,
      pinned: !!plan.pinned,
      createdAt: now - (HISTORY_DAYS + 5) * 86_400_000 + index,
    };
    exercises.push(exercise);

    const dates: string[] = [];
    for (let day = HISTORY_DAYS; day >= (plan.stopDaysAgo ?? 0); day--) {
      const iso = addDays(ref, -day);
      const [y, m, d] = iso.split('-').map(Number);
      if (plan.days.includes(new Date(y, m - 1, d).getDay()) && rand() > 0.12) dates.push(iso);
    }

    dates.forEach((date, i) => {
      const t = dates.length > 1 ? i / (dates.length - 1) : 1;
      let weight = plan.start + (plan.end - plan.start) * t;
      if (t > 0.55 && t < 0.62) weight *= 0.9;
      if (plan.fadeAtEnd && t > 0.8) weight -= plan.fadeAtEnd * ((t - 0.8) / 0.2);
      weight += (rand() - 0.5) * plan.inc * 2.4;
      const top = Math.max(plan.inc, Math.round(weight / plan.inc) * plan.inc);
      const reps = plan.reps[Math.floor(rand() * plan.reps.length)];
      const backoff = Math.max(plan.inc, Math.round((top * 0.88) / plan.inc) * plan.inc);
      const rir = Math.max(0, Math.round((2.5 - rand() * 2) * 2) / 2);
      const base = now - (HISTORY_DAYS - i) * 1000;

      sets.push({ id: newId(), exerciseId: exercise.id, date, weight: toKg(top, 'lb'), reps, rir, createdAt: base });
      for (let b = 0; b < plan.backoffSets; b++) {
        sets.push({ id: newId(), exerciseId: exercise.id, date, weight: toKg(backoff, 'lb'), reps: plan.backoffReps, createdAt: base + b + 1 });
      }
    });
  });

  exercises.push({ id: newId(), name: 'Front Squat', category: 'Legs', pinned: false, createdAt: now });

  return { version: 1, exercises, sets, settings };
}
