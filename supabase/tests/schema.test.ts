import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL('../migrations/001_init.sql', import.meta.url));
const A = randomUUID();
const B = randomUUID();
let db: PGlite;

function as<T>(uid: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await tx.exec('set local role authenticated');
    return fn(tx);
  });
}

async function addLift(uid: string, name = 'Squat'): Promise<string> {
  const id = randomUUID();
  await as(uid, (tx) => tx.query(`insert into exercises (id, name, created_at) values ($1, $2, now())`, [id, name]));
  return id;
}

async function addSet(uid: string, exerciseId: string, reps = 5): Promise<string> {
  const id = randomUUID();
  await as(uid, (tx) =>
    tx.query(`insert into sets (id, exercise_id, date, weight_kg, reps, created_at) values ($1, $2, '2026-09-20', 100, $3, now())`, [
      id,
      exerciseId,
      reps,
    ]),
  );
  return id;
}

async function count(uid: string, table: string): Promise<number> {
  const res = await as(uid, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from ${table}`));
  return res.rows[0].n;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    insert into auth.users (id) values ('${A}'), ('${B}');
  `);
  await db.exec(readFileSync(migrationPath, 'utf8'));
});

describe('schema security', () => {
  it('shows each user only their own lifts and sets', async () => {
    const lift = await addLift(A);
    await addSet(A, lift);
    expect(await count(A, 'exercises')).toBeGreaterThan(0);
    expect(await count(A, 'sets')).toBeGreaterThan(0);
    expect(await count(B, 'exercises')).toBe(0);
    expect(await count(B, 'sets')).toBe(0);
  });

  it('refuses rows written for another user', async () => {
    await expect(
      as(B, (tx) => tx.query(`insert into exercises (id, user_id, name) values ($1, $2, 'Bench')`, [randomUUID(), A])),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuses a set attached to another user’s lift', async () => {
    const lift = await addLift(A, 'Deadlift');
    await expect(addSet(B, lift)).rejects.toThrow(/foreign key/);
  });

  it('cannot update or delete another user’s rows', async () => {
    const lift = await addLift(A, 'Press');
    const deleted = await as(B, (tx) => tx.query(`delete from exercises where id = $1`, [lift]));
    const updated = await as(B, (tx) => tx.query(`update exercises set name = 'x' where id = $1`, [lift]));
    expect(deleted.affectedRows).toBe(0);
    expect(updated.affectedRows).toBe(0);
    const still = await as(A, (tx) => tx.query<{ name: string }>(`select name from exercises where id = $1`, [lift]));
    expect(still.rows[0].name).toBe('Press');
  });

  it('gives the anon role no access', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon');
        await tx.query('select * from exercises');
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('rejects impossible values', async () => {
    const lift = await addLift(A, 'Row');
    await expect(addSet(A, lift, 0)).rejects.toThrow(/check constraint/);
    await expect(as(A, (tx) => tx.query(`insert into exercises (id, name) values ($1, '   ')`, [randomUUID()]))).rejects.toThrow(
      /check constraint/,
    );
  });

  it('deletes a lift’s sets with it', async () => {
    const lift = await addLift(A, 'Curl');
    const set = await addSet(A, lift);
    await as(A, (tx) => tx.query(`delete from exercises where id = $1`, [lift]));
    const left = await as(A, (tx) => tx.query(`select 1 from sets where id = $1`, [set]));
    expect(left.rows).toHaveLength(0);
  });
});

describe('functions', () => {
  it('reorder_exercises sets positions from the given order', async () => {
    const first = await addLift(A, 'First');
    const second = await addLift(A, 'Second');
    await as(A, (tx) => tx.query(`select public.reorder_exercises($1::uuid[])`, [[second, first]]));
    const res = await as(A, (tx) =>
      tx.query<{ id: string; position: number }>(`select id, position from exercises where id = any($1::uuid[])`, [[first, second]]),
    );
    const pos = Object.fromEntries(res.rows.map((r) => [r.id, r.position]));
    expect(pos[second]).toBe(0);
    expect(pos[first]).toBe(1);
  });

  it('replace_board swaps the caller’s whole board and leaves others alone', async () => {
    const theirs = await addLift(B, 'Theirs');
    const lift = randomUUID();
    const payload = {
      exercises: [{ id: lift, name: 'Only', category: null, pinned: true, position: 0, created_at: '2026-09-01T00:00:00.000Z' }],
      sets: [
        {
          id: randomUUID(),
          exercise_id: lift,
          date: '2026-09-02',
          weight_kg: 60.5,
          reps: 8,
          rpe: 8.5,
          notes: null,
          created_at: '2026-09-02T10:00:00.000Z',
        },
      ],
    };
    await as(A, (tx) => tx.query(`select public.replace_board($1::jsonb)`, [JSON.stringify(payload)]));
    expect(await count(A, 'exercises')).toBe(1);
    expect(await count(A, 'sets')).toBe(1);
    const mine = await as(A, (tx) => tx.query<{ name: string; pinned: boolean }>(`select name, pinned from exercises`));
    expect(mine.rows[0]).toEqual({ name: 'Only', pinned: true });
    const kept = await as(B, (tx) => tx.query(`select 1 from exercises where id = $1`, [theirs]));
    expect(kept.rows).toHaveLength(1);
  });

  it('replace_board with an empty payload clears the board', async () => {
    await addLift(A, 'Temp');
    await as(A, (tx) => tx.query(`select public.replace_board($1::jsonb)`, [JSON.stringify({ exercises: [], sets: [] })]));
    expect(await count(A, 'exercises')).toBe(0);
  });
});

describe('user settings', () => {
  it('stores one unit per user', async () => {
    const upsert = `insert into user_settings (unit) values ($1) on conflict (user_id) do update set unit = excluded.unit`;
    await as(A, (tx) => tx.query(upsert, ['kg']));
    await as(A, (tx) => tx.query(upsert, ['lb']));
    const mine = await as(A, (tx) => tx.query<{ unit: string }>(`select unit from user_settings`));
    expect(mine.rows).toEqual([{ unit: 'lb' }]);
    expect(await count(B, 'user_settings')).toBe(0);
    await expect(as(A, (tx) => tx.query(upsert, ['stone']))).rejects.toThrow(/check constraint/);
  });
});
