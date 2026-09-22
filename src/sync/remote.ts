import { supabase } from '../supabase';
import type { AppData, Unit } from '../types';
import { classify } from './classify';
import type { RemoteOp } from './ops';
import type { SendOutcome } from './queue';
import { boardFromDb, type DbExercise, type DbSet } from './rows';

const PAGE = 1000;
const EXERCISE_COLUMNS = 'id,name,category,pinned,position,created_at';
const SET_COLUMNS = 'id,exercise_id,date,weight_kg,reps,rpe,notes,created_at';

interface Result {
  error: { message: string; code?: string } | null;
  status: number;
}

export async function fetchBoard(): Promise<AppData> {
  const lifts = await supabase.from('exercises').select(EXERCISE_COLUMNS).order('position').range(0, PAGE - 1);
  if (lifts.error) throw lifts.error;
  const sets: DbSet[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await supabase.from('sets').select(SET_COLUMNS).order('created_at').order('id').range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const rows = (page.data ?? []) as DbSet[];
    sets.push(...rows);
    if (rows.length < PAGE) break;
  }
  const settings = await supabase.from('user_settings').select('unit').maybeSingle();
  if (settings.error) throw settings.error;
  const unit: Unit = settings.data?.unit === 'kg' ? 'kg' : 'lb';
  return boardFromDb((lifts.data ?? []) as DbExercise[], sets, unit);
}

function run(op: RemoteOp, userId: string): PromiseLike<Result> {
  switch (op.kind) {
    case 'upsertExercises':
      return supabase.from('exercises').upsert(op.rows);
    case 'updateExercise':
      return supabase.from('exercises').update(op.patch).eq('id', op.id);
    case 'deleteExercise':
      return supabase.from('exercises').delete().eq('id', op.id);
    case 'reorder':
      return supabase.rpc('reorder_exercises', { ids: op.ids });
    case 'upsertSets':
      return supabase.from('sets').upsert(op.rows);
    case 'deleteSet':
      return supabase.from('sets').delete().eq('id', op.id);
    case 'setUnit':
      return supabase.from('user_settings').upsert({ user_id: userId, unit: op.unit });
    case 'replaceBoard':
      return supabase.rpc('replace_board', { payload: { exercises: op.exercises, sets: op.sets } });
  }
}

export async function sendOp(op: RemoteOp, userId: string): Promise<SendOutcome> {
  const { status, error } = await run(op, userId);
  return classify(status, error);
}
