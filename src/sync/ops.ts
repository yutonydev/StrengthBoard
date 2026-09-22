import type { Action } from '../store';
import type { AppData, Unit } from '../types';
import { boardToDb, exerciseToDb, setToDb, type DbExercise, type DbSet } from './rows';

export type RemoteOp =
  | { kind: 'upsertExercises'; rows: DbExercise[] }
  | { kind: 'updateExercise'; id: string; patch: { name?: string; category?: string | null; pinned?: boolean } }
  | { kind: 'deleteExercise'; id: string }
  | { kind: 'reorder'; ids: string[] }
  | { kind: 'upsertSets'; rows: DbSet[] }
  | { kind: 'deleteSet'; id: string }
  | { kind: 'setUnit'; unit: Unit }
  | { kind: 'replaceBoard'; exercises: DbExercise[]; sets: DbSet[] };

function order(after: AppData): RemoteOp {
  return { kind: 'reorder', ids: after.exercises.map((e) => e.id) };
}

function liftRow(after: AppData, id: string): DbExercise[] {
  const i = after.exercises.findIndex((e) => e.id === id);
  return i < 0 ? [] : [exerciseToDb(after.exercises[i], i)];
}

export function toRemoteOps(action: Action, after: AppData): RemoteOp[] {
  switch (action.type) {
    case 'addExercise':
      return [{ kind: 'upsertExercises', rows: liftRow(after, action.exercise.id) }, order(after)];
    case 'updateExercise': {
      const patch: { name?: string; category?: string | null } = {};
      if (action.patch.name !== undefined) patch.name = action.patch.name;
      if ('category' in action.patch) patch.category = action.patch.category ?? null;
      return [{ kind: 'updateExercise', id: action.id, patch }];
    }
    case 'deleteExercise':
      return [{ kind: 'deleteExercise', id: action.id }];
    case 'restoreExercise': {
      const out: RemoteOp[] = [{ kind: 'upsertExercises', rows: liftRow(after, action.exercise.id) }];
      if (action.sets.length) out.push({ kind: 'upsertSets', rows: action.sets.map(setToDb) });
      out.push(order(after));
      return out;
    }
    case 'togglePin': {
      const lift = after.exercises.find((e) => e.id === action.id);
      return lift ? [{ kind: 'updateExercise', id: lift.id, patch: { pinned: lift.pinned } }, order(after)] : [];
    }
    case 'reorder':
    case 'move':
      return [order(after)];
    case 'addSet':
    case 'restoreSet':
      return [{ kind: 'upsertSets', rows: [setToDb(action.set)] }];
    case 'deleteSet':
      return [{ kind: 'deleteSet', id: action.id }];
    case 'settings':
      return action.patch.unit ? [{ kind: 'setUnit', unit: action.patch.unit }] : [];
    case 'replace': {
      const { exercises, sets } = boardToDb(after);
      return [{ kind: 'replaceBoard', exercises, sets }];
    }
  }
}
