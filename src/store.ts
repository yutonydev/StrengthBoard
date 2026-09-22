import type { AppData, Exercise, Settings, WorkoutSet } from './types';

export const DEFAULT_SETTINGS: Settings = { unit: 'lb' };

export function emptyData(settings: Settings = DEFAULT_SETTINGS): AppData {
  return { version: 1, exercises: [], sets: [], settings };
}

export type Action =
  | { type: 'addExercise'; exercise: Exercise }
  | { type: 'updateExercise'; id: string; patch: Partial<Pick<Exercise, 'name' | 'category'>> }
  | { type: 'deleteExercise'; id: string }
  | { type: 'restoreExercise'; exercise: Exercise; index: number; sets: WorkoutSet[] }
  | { type: 'togglePin'; id: string }
  | { type: 'reorder'; activeId: string; overId: string }
  | { type: 'move'; id: string; dir: -1 | 1 }
  | { type: 'addSet'; set: WorkoutSet }
  | { type: 'deleteSet'; id: string }
  | { type: 'restoreSet'; set: WorkoutSet }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'replace'; data: AppData };

export function normalize(list: Exercise[]): Exercise[] {
  return [...list.filter((e) => e.pinned), ...list.filter((e) => !e.pinned)];
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'addExercise': {
      if (state.exercises.some((e) => e.id === action.exercise.id)) return state;
      const list = [...state.exercises];
      const at = action.exercise.pinned ? list.filter((e) => e.pinned).length : list.length;
      list.splice(at, 0, action.exercise);
      return { ...state, exercises: list };
    }
    case 'updateExercise':
      return {
        ...state,
        exercises: state.exercises.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      };
    case 'deleteExercise':
      return {
        ...state,
        exercises: state.exercises.filter((e) => e.id !== action.id),
        sets: state.sets.filter((s) => s.exerciseId !== action.id),
      };
    case 'restoreExercise': {
      if (state.exercises.some((e) => e.id === action.exercise.id)) return state;
      const list = [...state.exercises];
      list.splice(Math.min(action.index, list.length), 0, action.exercise);
      const known = new Set(state.sets.map((s) => s.id));
      return { ...state, exercises: normalize(list), sets: [...state.sets, ...action.sets.filter((s) => !known.has(s.id))] };
    }
    case 'togglePin': {
      const ex = state.exercises.find((e) => e.id === action.id);
      if (!ex) return state;
      const rest = state.exercises.filter((e) => e.id !== action.id);
      const pinnedCount = rest.filter((e) => e.pinned).length;
      const updated = { ...ex, pinned: !ex.pinned };
      rest.splice(pinnedCount, 0, updated);
      return { ...state, exercises: rest };
    }
    case 'reorder': {
      const from = state.exercises.findIndex((e) => e.id === action.activeId);
      const to = state.exercises.findIndex((e) => e.id === action.overId);
      if (from < 0 || to < 0 || from === to) return state;
      if (state.exercises[from].pinned !== state.exercises[to].pinned) return state;
      return { ...state, exercises: arrayMove(state.exercises, from, to) };
    }
    case 'move': {
      const from = state.exercises.findIndex((e) => e.id === action.id);
      const to = from + action.dir;
      if (from < 0 || to < 0 || to >= state.exercises.length) return state;
      if (state.exercises[from].pinned !== state.exercises[to].pinned) return state;
      return { ...state, exercises: arrayMove(state.exercises, from, to) };
    }
    case 'addSet':
    case 'restoreSet':
      return state.sets.some((s) => s.id === action.set.id) ? state : { ...state, sets: [...state.sets, action.set] };
    case 'deleteSet':
      return { ...state, sets: state.sets.filter((s) => s.id !== action.id) };
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'replace':
      return { ...action.data, exercises: normalize(action.data.exercises) };
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function parseData(raw: unknown): AppData | null {
  if (!isObj(raw) || !Array.isArray(raw.exercises) || !Array.isArray(raw.sets)) return null;
  const exercises: Exercise[] = raw.exercises.filter(isObj).flatMap((e) =>
    typeof e.id === 'string' && typeof e.name === 'string' && e.name.trim()
      ? [{
          id: e.id,
          name: e.name.trim(),
          category: typeof e.category === 'string' && e.category.trim() ? e.category.trim() : undefined,
          pinned: e.pinned === true,
          createdAt: typeof e.createdAt === 'number' ? e.createdAt : Date.now(),
        }]
      : [],
  );
  const ids = new Set(exercises.map((e) => e.id));
  const sets: WorkoutSet[] = raw.sets.filter(isObj).flatMap((s) =>
    typeof s.id === 'string' &&
    typeof s.exerciseId === 'string' &&
    ids.has(s.exerciseId) &&
    typeof s.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    typeof s.weight === 'number' &&
    Number.isFinite(s.weight) &&
    s.weight >= 0 &&
    typeof s.reps === 'number' &&
    Number.isInteger(s.reps) &&
    s.reps > 0
      ? [{
          id: s.id,
          exerciseId: s.exerciseId,
          date: s.date,
          weight: s.weight,
          reps: s.reps,
          rpe: typeof s.rpe === 'number' && s.rpe > 0 && s.rpe <= 10 ? s.rpe : undefined,
          notes: typeof s.notes === 'string' && s.notes.trim() ? s.notes.trim() : undefined,
          createdAt: typeof s.createdAt === 'number' ? s.createdAt : 0,
        }]
      : [],
  );
  const st = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = { unit: st.unit === 'kg' ? 'kg' : 'lb' };
  return { version: 1, exercises: normalize(exercises), sets, settings };
}
