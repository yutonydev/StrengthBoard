# Accounts and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users sign in with email and password and keep their StrengthBoard lifts and sets in a Supabase account, so the board is the same on every device, with instant saves that queue while offline.

**Architecture:** The React SPA talks to Supabase directly with `@supabase/supabase-js`. Postgres Row Level Security scopes every row to its owner. The existing pure `reducer` stays the single source of UI state. A new sync layer turns each dispatched action into idempotent remote operations. It persists them in a FIFO queue in `localStorage`, uploads them in order with retry and backoff, and keeps the last fetched board as an offline cache. The UI shows `replay(serverBoard, pendingActions)`.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Tailwind v4, Vitest 5, `@supabase/supabase-js` 2.x, and `@electric-sql/pglite` (dev only, runs the SQL migration in tests).

**Spec:** `docs/superpowers/specs/2026-09-22-accounts-and-sync-design.md`

## Global Constraints

- No comments in any file: TS, TSX, CSS, SQL, HTML, JSON, config.
- Do not run `git commit`. Every task ends by staging with `git add`, and the user makes the commits.
- New dependencies are limited to `@supabase/supabase-js` (runtime) and `@electric-sql/pglite` (dev).
- Env var names are exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- localStorage keys are exactly `strengthboard:theme`, `strengthboard:cache:<userId>` and `strengthboard:queue:<userId>`.
- Weight is stored in kilograms, in the column `weight_kg double precision`.
- The minimum password length is 8. The mismatch message is exactly `Passwords don’t match`.
- The UI uses the existing tokens and classes: `.field`, `.label`, `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.icon-btn`, `text-muted`, `text-danger`, `text-warn`, `text-accent-text`, `bg-surface`, `border-line`, `shadow-pop`.
- After every task, `npm test` and `npm run build` must both pass.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/001_init.sql` | create | Tables, RLS, triggers, `reorder_exercises`, `replace_board` |
| `supabase/tests/schema.test.ts` | create | Runs the migration in PGlite and proves the RLS and function behavior |
| `src/theme.ts` | create | Device-local theme preference and the `useTheme` hook |
| `src/types.ts` | modify | `Settings` loses `theme` |
| `src/store.ts` | modify | Exports `normalize`, makes the reducer idempotent, loses `useStore` |
| `src/lib/id.ts` | modify | UUID v4 fallback for insecure contexts |
| `src/sync/rows.ts` | create | Maps between app objects and database rows |
| `src/sync/ops.ts` | create | `RemoteOp` type and `toRemoteOps(action, after)` |
| `src/sync/local.ts` | create | Key-value store helpers, board cache, `replay` |
| `src/sync/queue.ts` | create | `SyncQueue`, a persisted FIFO with retry, backoff and pause |
| `src/sync/classify.ts` | create | Maps a Supabase response to a `SendOutcome` |
| `src/sync/remote.ts` | create | `fetchBoard` and `sendOp` against Supabase |
| `src/sync/useSyncedStore.ts` | create | React hook that wires the reducer, cache, queue, fetch and status |
| `src/supabase.ts` | create | Supabase client and `supabaseConfigured` |
| `src/env.d.ts` | create | Types for the two env vars |
| `src/auth/passwords.ts` | create | Email and password validation, friendly error text |
| `src/auth/AuthProvider.tsx` | create | Session state, `useAuth`, password-recovery flag |
| `src/auth/AuthLayout.tsx` | create | Shared centered card layout |
| `src/auth/AuthScreen.tsx` | create | Sign in, create account, forgot password, and "check your email" screens |
| `src/auth/SetNewPassword.tsx` | create | The screen shown after following a reset link |
| `src/components/Logo.tsx` | create | Logo, extracted from `App.tsx` |
| `src/components/SyncStatus.tsx` | create | Sync status shown in the header |
| `src/components/AccountMenu.tsx` | create | Account email and sign out |
| `src/Root.tsx` | create | Picks the setup notice, splash, auth screens or board |
| `src/main.tsx` | modify | Renders `AuthProvider` and `Root` |
| `src/App.tsx` | modify | Takes `user`, uses `useSyncedStore` and `useTheme`, shows sync status and the account menu |
| `index.html` | modify | The pre-paint theme script reads `strengthboard:theme` |
| `.env.example` | create | Names of the two env vars |
| `README.md` | modify | Accounts section and setup steps |

---

### Task 1: Database schema with tested security

**Files:**
- Create: `supabase/migrations/001_init.sql`
- Create: `supabase/tests/schema.test.ts`
- Modify: `package.json` (dev dependency)

**Interfaces:**
- Produces:
  - Tables `public.exercises (id, user_id, name, category, pinned, position, created_at, updated_at)`, `public.sets (id, user_id, exercise_id, date, weight_kg, reps, rpe, notes, created_at)` and `public.user_settings (user_id, unit, updated_at)`
  - Functions `public.reorder_exercises(ids uuid[]) returns void` and `public.replace_board(payload jsonb) returns void`, where `payload = { exercises: DbExercise[], sets: DbSet[] }` using the row shapes from Task 3

- [ ] **Step 1: Install PGlite**

Run: `npm install -D @electric-sql/pglite`
Expected: `package.json` devDependencies now include `@electric-sql/pglite`.

- [ ] **Step 2: Write the failing schema tests**

Create `supabase/tests/schema.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run supabase/tests/schema.test.ts`
Expected: FAIL. `beforeAll` throws ENOENT because `001_init.sql` doesn't exist yet.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/001_init.sql`:

```sql
create table public.exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  category text check (category is null or char_length(category) <= 24),
  pinned boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.sets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id uuid not null,
  date date not null,
  weight_kg double precision not null check (weight_kg >= 0 and weight_kg <= 1000),
  reps smallint not null check (reps between 1 and 100),
  rpe numeric(3, 1) check (rpe is null or rpe between 1 and 10),
  notes text check (notes is null or char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade
);

create index sets_user_exercise_date on public.sets (user_id, exercise_id, date);

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  updated_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger exercises_touch_updated_at before update on public.exercises
for each row execute function public.touch_updated_at();

create trigger user_settings_touch_updated_at before update on public.user_settings
for each row execute function public.touch_updated_at();

alter table public.exercises enable row level security;
alter table public.sets enable row level security;
alter table public.user_settings enable row level security;

create policy exercises_owner on public.exercises for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy sets_owner on public.sets for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy user_settings_owner on public.user_settings for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.exercises, public.sets, public.user_settings from anon;

create function public.reorder_exercises(ids uuid[]) returns void
language sql security invoker set search_path = '' as $$
  update public.exercises e
  set position = (o.ord - 1)::integer
  from unnest(ids) with ordinality as o(id, ord)
  where e.id = o.id and e.user_id = (select auth.uid());
$$;

create function public.replace_board(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.exercises where user_id = (select auth.uid());
  insert into public.exercises (id, name, category, pinned, position, created_at)
  select
    (x ->> 'id')::uuid,
    x ->> 'name',
    nullif(x ->> 'category', ''),
    coalesce((x ->> 'pinned')::boolean, false),
    coalesce((x ->> 'position')::integer, 0),
    coalesce((x ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload -> 'exercises', '[]'::jsonb)) as x;
  insert into public.sets (id, exercise_id, date, weight_kg, reps, rpe, notes, created_at)
  select
    (x ->> 'id')::uuid,
    (x ->> 'exercise_id')::uuid,
    (x ->> 'date')::date,
    (x ->> 'weight_kg')::double precision,
    (x ->> 'reps')::smallint,
    (x ->> 'rpe')::numeric,
    nullif(x ->> 'notes', ''),
    coalesce((x ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload -> 'sets', '[]'::jsonb)) as x;
end;
$$;

revoke execute on function public.reorder_exercises(uuid[]) from public, anon;
revoke execute on function public.replace_board(jsonb) from public, anon;
grant execute on function public.reorder_exercises(uuid[]) to authenticated;
grant execute on function public.replace_board(jsonb) to authenticated;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run supabase/tests/schema.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Run the whole suite and build**

Run: `npm test && npm run build`
Expected: all tests pass and the build succeeds.

- [ ] **Step 7: Stage**

```bash
git add package.json package-lock.json supabase/migrations/001_init.sql supabase/tests/schema.test.ts
```

---

### Task 2: Theme becomes device-local

**Files:**
- Create: `src/theme.ts`
- Modify: `src/types.ts`, `src/store.ts`, `src/App.tsx`, `index.html`, `src/lib/lib.test.ts:131-135`

**Interfaces:**
- Produces:
  - `THEME_KEY = 'strengthboard:theme'`
  - `readTheme(): ThemePref`
  - `useTheme(): readonly [ThemePref, (t: ThemePref) => void]`
  - `Settings` becomes `{ unit: Unit }`

- [ ] **Step 1: Update the parseData test to expect no theme**

In `src/lib/lib.test.ts`, replace:

```ts
    expect(data?.settings).toEqual({ unit: 'kg', theme: 'system' });
```

with:

```ts
    expect(data?.settings).toEqual({ unit: 'kg' });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/lib.test.ts -t "parseData"`
Expected: FAIL, because the received settings still contain `theme: 'system'`.

- [ ] **Step 3: Remove theme from Settings and the store**

In `src/types.ts`, replace:

```ts
export interface Settings {
  unit: Unit;
  theme: ThemePref;
}
```

with:

```ts
export interface Settings {
  unit: Unit;
}
```

In `src/store.ts`, replace:

```ts
export const DEFAULT_SETTINGS: Settings = { unit: 'lb', theme: 'system' };
```

with:

```ts
export const DEFAULT_SETTINGS: Settings = { unit: 'lb' };
```

and replace:

```ts
  const settings: Settings = {
    unit: st.unit === 'kg' ? 'kg' : 'lb',
    theme: st.theme === 'light' || st.theme === 'dark' ? st.theme : 'system',
  };
```

with:

```ts
  const settings: Settings = { unit: st.unit === 'kg' ? 'kg' : 'lb' };
```

- [ ] **Step 4: Create the theme module**

Create `src/theme.ts`:

```ts
import { useEffect, useState } from 'react';
import type { ThemePref } from './types';

export const THEME_KEY = 'strengthboard:theme';

export function readTheme(): ThemePref {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePref>(readTheme);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  return [theme, setTheme] as const;
}
```

- [ ] **Step 5: Switch App to useTheme**

In `src/App.tsx`, add the import below the `./components/Toasts` import:

```ts
import { useTheme } from './theme';
```

Replace the theme effect block:

```ts
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);
```

with:

```ts
  const [theme, setTheme] = useTheme();
```

Replace:

```ts
  const ThemeIcon = settings.theme === 'dark' ? Moon : settings.theme === 'light' ? Sun : Monitor;
```

with:

```ts
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
```

Replace the theme button's three props:

```tsx
              onClick={() => dispatch({ type: 'settings', patch: { theme: THEME_NEXT[settings.theme] } })}
              aria-label={`Theme: ${settings.theme}. Switch to ${THEME_NEXT[settings.theme]}`}
              title={`Theme: ${settings.theme}`}
```

with:

```tsx
              onClick={() => setTheme(THEME_NEXT[theme])}
              aria-label={`Theme: ${theme}. Switch to ${THEME_NEXT[theme]}`}
              title={`Theme: ${theme}`}
```

- [ ] **Step 6: Point the pre-paint script at the new key**

In `index.html`, replace:

```html
        var raw = localStorage.getItem('strengthboard:v1');
        var pref = raw ? (JSON.parse(raw).settings || {}).theme : 'system';
```

with:

```html
        var pref = localStorage.getItem('strengthboard:theme') || 'system';
```

- [ ] **Step 7: Run tests and build**

Run: `npm test && npm run build`
Expected: all pass. TypeScript reports no errors, so nothing else still reads `settings.theme`.

- [ ] **Step 8: Stage**

```bash
git add src/theme.ts src/types.ts src/store.ts src/App.tsx index.html src/lib/lib.test.ts
```

---

### Task 3: Row mapping, idempotent reducer, UUID fallback

**Files:**
- Create: `src/sync/rows.ts`, `src/sync/rows.test.ts`
- Modify: `src/store.ts`, `src/lib/id.ts`, `src/lib/lib.test.ts`

**Interfaces:**
- Consumes: `Exercise`, `WorkoutSet`, `AppData`, `Unit` from `src/types.ts`
- Produces:
  - `interface DbExercise { id: string; name: string; category: string | null; pinned: boolean; position: number; created_at: string }`
  - `interface DbSet { id: string; exercise_id: string; date: string; weight_kg: number; reps: number; rpe: number | null; notes: string | null; created_at: string }`
  - `exerciseToDb(e: Exercise, position: number): DbExercise`
  - `setToDb(s: WorkoutSet): DbSet`
  - `exerciseFromDb(r: DbExercise): Exercise`
  - `setFromDb(r: DbSet): WorkoutSet`
  - `boardToDb(data: AppData): { exercises: DbExercise[]; sets: DbSet[] }`
  - `boardFromDb(exercises: DbExercise[], sets: DbSet[], unit: Unit): AppData`
  - `normalize(list: Exercise[]): Exercise[]`, exported from `src/store.ts`
  - `uuidV4(bytes: Uint8Array): string`, exported from `src/lib/id.ts`

- [ ] **Step 1: Write the failing row tests**

Create `src/sync/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSet } from '../types';
import { boardFromDb, boardToDb, exerciseFromDb, exerciseToDb, setFromDb, setToDb, type DbExercise, type DbSet } from './rows';

const lift: Exercise = { id: 'b', name: 'Row', category: 'Pull', pinned: false, createdAt: Date.UTC(2026, 8, 1, 10, 0, 0, 123) };
const set: WorkoutSet = { id: 's', exerciseId: 'b', date: '2026-09-02', weight: 81.6466266, reps: 8, createdAt: Date.UTC(2026, 8, 2) };

describe('rows', () => {
  it('maps a lift to a row with its position', () => {
    expect(exerciseToDb(lift, 3)).toEqual({
      id: 'b',
      name: 'Row',
      category: 'Pull',
      pinned: false,
      position: 3,
      created_at: '2026-09-01T10:00:00.123Z',
    });
  });

  it('round-trips lifts and sets without losing anything', () => {
    expect(exerciseFromDb(exerciseToDb(lift, 0))).toEqual(lift);
    expect(setFromDb(setToDb(set))).toEqual(set);
    const full: WorkoutSet = { ...set, rpe: 8.5, notes: 'belt' };
    expect(setFromDb(setToDb(full))).toEqual(full);
  });

  it('stores missing optional values as null', () => {
    expect(setToDb(set)).toMatchObject({ rpe: null, notes: null, weight_kg: 81.6466266, exercise_id: 'b' });
    expect(exerciseToDb({ ...lift, category: undefined }, 0).category).toBeNull();
  });

  it('accepts numeric columns that arrive as strings', () => {
    const row = { ...setToDb(set), rpe: '8.5', weight_kg: '100.25', reps: '5' } as unknown as DbSet;
    expect(setFromDb(row)).toMatchObject({ rpe: 8.5, weight: 100.25, reps: 5 });
  });

  it('builds a board ordered by position with pinned lifts first', () => {
    const rows: DbExercise[] = [
      { ...exerciseToDb({ ...lift, id: 'x', pinned: false }, 1) },
      { ...exerciseToDb({ ...lift, id: 'y', pinned: true }, 2) },
      { ...exerciseToDb({ ...lift, id: 'z', pinned: false }, 0) },
    ];
    const board = boardFromDb(rows, [setToDb(set)], 'kg');
    expect(board.exercises.map((e) => e.id)).toEqual(['y', 'z', 'x']);
    expect(board.settings).toEqual({ unit: 'kg' });
    expect(board.sets).toEqual([set]);
  });

  it('writes a whole board with positions from its order', () => {
    const board = boardFromDb([exerciseToDb(lift, 0)], [setToDb(set)], 'lb');
    expect(boardToDb(board)).toEqual({ exercises: [exerciseToDb(lift, 0)], sets: [setToDb(set)] });
  });
});
```

- [ ] **Step 2: Add failing tests for the reducer's idempotency and the UUID fallback**

In `src/lib/lib.test.ts`, change the import line `import { emptyData, parseData, reducer } from '../store';` to:

```ts
import { emptyData, parseData, reducer } from '../store';
import { uuidV4 } from './id';
```

Append this to the end of the file:

```ts
describe('reducer idempotency', () => {
  const lift: Exercise = { id: 'L', name: 'L', pinned: false, createdAt: 0 };
  const s: WorkoutSet = { id: 'S', exerciseId: 'L', date: '2026-09-01', weight: 50, reps: 5, createdAt: 1 };

  it('ignores adding a lift or set that already exists', () => {
    const once = reducer(reducer(emptyData(), { type: 'addExercise', exercise: lift }), { type: 'addSet', set: s });
    const twice = reducer(reducer(once, { type: 'addExercise', exercise: lift }), { type: 'addSet', set: s });
    expect(twice.exercises).toHaveLength(1);
    expect(twice.sets).toHaveLength(1);
  });

  it('ignores restoring a lift that is already present', () => {
    const base = reducer(emptyData(), { type: 'addExercise', exercise: lift });
    const next = reducer(base, { type: 'restoreExercise', exercise: lift, index: 0, sets: [s] });
    expect(next.exercises).toHaveLength(1);
    expect(next.sets).toHaveLength(0);
  });
});

describe('uuidV4', () => {
  it('formats random bytes as a version 4 UUID', () => {
    const id = uuidV4(new Uint8Array(16).fill(255));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/sync/rows.test.ts src/lib/lib.test.ts`
Expected: FAIL. `./rows` can't be resolved, `uuidV4` isn't exported, and the idempotency tests see duplicates.

- [ ] **Step 4: Export normalize and make the reducer idempotent**

In `src/store.ts`, replace `function normalize(list: Exercise[]): Exercise[] {` with:

```ts
export function normalize(list: Exercise[]): Exercise[] {
```

Replace the `addExercise` case:

```ts
    case 'addExercise': {
      const list = [...state.exercises];
```

with:

```ts
    case 'addExercise': {
      if (state.exercises.some((e) => e.id === action.exercise.id)) return state;
      const list = [...state.exercises];
```

Replace the `restoreExercise` case:

```ts
    case 'restoreExercise': {
      const list = [...state.exercises];
      list.splice(Math.min(action.index, list.length), 0, action.exercise);
      return { ...state, exercises: normalize(list), sets: [...state.sets, ...action.sets] };
    }
```

with:

```ts
    case 'restoreExercise': {
      if (state.exercises.some((e) => e.id === action.exercise.id)) return state;
      const list = [...state.exercises];
      list.splice(Math.min(action.index, list.length), 0, action.exercise);
      const known = new Set(state.sets.map((s) => s.id));
      return { ...state, exercises: normalize(list), sets: [...state.sets, ...action.sets.filter((s) => !known.has(s.id))] };
    }
```

Replace the set cases:

```ts
    case 'addSet':
    case 'restoreSet':
      return { ...state, sets: [...state.sets, action.set] };
```

with:

```ts
    case 'addSet':
    case 'restoreSet':
      return state.sets.some((s) => s.id === action.set.id) ? state : { ...state, sets: [...state.sets, action.set] };
```

- [ ] **Step 5: Add the UUID fallback**

Replace the whole contents of `src/lib/id.ts` with:

```ts
export function uuidV4(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return uuidV4(crypto.getRandomValues(new Uint8Array(16)));
}
```

- [ ] **Step 6: Create the row mapping**

Create `src/sync/rows.ts`:

```ts
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
  rpe: number | null;
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
    rpe: s.rpe ?? null,
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
  if (r.rpe !== null && r.rpe !== undefined) s.rpe = Number(r.rpe);
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/sync/rows.test.ts src/lib/lib.test.ts`
Expected: PASS.

- [ ] **Step 8: Run all tests and build, then stage**

Run: `npm test && npm run build`
Expected: all pass.

```bash
git add src/sync/rows.ts src/sync/rows.test.ts src/store.ts src/lib/id.ts src/lib/lib.test.ts
```

---

### Task 4: Actions to remote operations

**Files:**
- Create: `src/sync/ops.ts`, `src/sync/ops.test.ts`

**Interfaces:**
- Consumes: `Action` and `reducer` from `src/store.ts`; the row functions and types from Task 3
- Produces:
  - `type RemoteOp = { kind: 'upsertExercises'; rows: DbExercise[] } | { kind: 'updateExercise'; id: string; patch: { name?: string; category?: string | null; pinned?: boolean } } | { kind: 'deleteExercise'; id: string } | { kind: 'reorder'; ids: string[] } | { kind: 'upsertSets'; rows: DbSet[] } | { kind: 'deleteSet'; id: string } | { kind: 'setUnit'; unit: Unit } | { kind: 'replaceBoard'; exercises: DbExercise[]; sets: DbSet[] }`
  - `toRemoteOps(action: Action, after: AppData): RemoteOp[]`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/ops.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { reducer, type Action } from '../store';
import type { AppData, Exercise, WorkoutSet } from '../types';
import { toRemoteOps } from './ops';
import { exerciseToDb, setToDb } from './rows';

const A: Exercise = { id: 'a', name: 'Squat', pinned: true, createdAt: 1_700_000_000_000 };
const B: Exercise = { id: 'b', name: 'Row', category: 'Pull', pinned: false, createdAt: 1_700_000_000_001 };
const S: WorkoutSet = { id: 's1', exerciseId: 'a', date: '2026-09-20', weight: 100, reps: 5, createdAt: 1_700_000_000_002 };
const base: AppData = { version: 1, exercises: [A, B], sets: [S], settings: { unit: 'lb' } };

function ops(action: Action, from: AppData = base) {
  return toRemoteOps(action, reducer(from, action));
}

describe('toRemoteOps', () => {
  it('adds a lift and saves the new order', () => {
    const C: Exercise = { id: 'c', name: 'Dip', pinned: false, createdAt: 1_700_000_000_003 };
    expect(ops({ type: 'addExercise', exercise: C })).toEqual([
      { kind: 'upsertExercises', rows: [exerciseToDb(C, 2)] },
      { kind: 'reorder', ids: ['a', 'b', 'c'] },
    ]);
  });

  it('renames a lift and clears its category', () => {
    expect(ops({ type: 'updateExercise', id: 'b', patch: { name: 'Barbell Row', category: undefined } })).toEqual([
      { kind: 'updateExercise', id: 'b', patch: { name: 'Barbell Row', category: null } },
    ]);
  });

  it('deletes a lift', () => {
    expect(ops({ type: 'deleteExercise', id: 'a' })).toEqual([{ kind: 'deleteExercise', id: 'a' }]);
  });

  it('restores a deleted lift with its sets and order', () => {
    const without = reducer(base, { type: 'deleteExercise', id: 'a' });
    expect(ops({ type: 'restoreExercise', exercise: A, index: 0, sets: [S] }, without)).toEqual([
      { kind: 'upsertExercises', rows: [exerciseToDb(A, 0)] },
      { kind: 'upsertSets', rows: [setToDb(S)] },
      { kind: 'reorder', ids: ['a', 'b'] },
    ]);
  });

  it('pins a lift and saves the new order', () => {
    expect(ops({ type: 'togglePin', id: 'b' })).toEqual([
      { kind: 'updateExercise', id: 'b', patch: { pinned: true } },
      { kind: 'reorder', ids: ['a', 'b'] },
    ]);
  });

  it('saves the order after a drag or move', () => {
    const two: AppData = { ...base, exercises: [A, { ...B, pinned: true }] };
    expect(ops({ type: 'reorder', activeId: 'b', overId: 'a' }, two)).toEqual([{ kind: 'reorder', ids: ['b', 'a'] }]);
    expect(ops({ type: 'move', id: 'a', dir: 1 }, two)).toEqual([{ kind: 'reorder', ids: ['b', 'a'] }]);
  });

  it('adds, restores and deletes sets', () => {
    const S2: WorkoutSet = { ...S, id: 's2', reps: 3 };
    expect(ops({ type: 'addSet', set: S2 })).toEqual([{ kind: 'upsertSets', rows: [setToDb(S2)] }]);
    expect(ops({ type: 'restoreSet', set: S2 })).toEqual([{ kind: 'upsertSets', rows: [setToDb(S2)] }]);
    expect(ops({ type: 'deleteSet', id: 's1' })).toEqual([{ kind: 'deleteSet', id: 's1' }]);
  });

  it('saves the unit and nothing else from settings', () => {
    expect(ops({ type: 'settings', patch: { unit: 'kg' } })).toEqual([{ kind: 'setUnit', unit: 'kg' }]);
    expect(ops({ type: 'settings', patch: {} })).toEqual([]);
  });

  it('replaces the whole board', () => {
    expect(ops({ type: 'replace', data: base })).toEqual([
      { kind: 'replaceBoard', exercises: [exerciseToDb(A, 0), exerciseToDb(B, 1)], sets: [setToDb(S)] },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sync/ops.test.ts`
Expected: FAIL, because `./ops` can't be resolved.

- [ ] **Step 3: Implement ops**

Create `src/sync/ops.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sync/ops.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run all tests and build, then stage**

Run: `npm test && npm run build`

```bash
git add src/sync/ops.ts src/sync/ops.test.ts
```

---

### Task 5: Local cache, replay and the upload queue

**Files:**
- Create: `src/sync/local.ts`, `src/sync/local.test.ts`, `src/sync/queue.ts`, `src/sync/queue.test.ts`

**Interfaces:**
- Consumes: `parseData`, `reducer` and `Action` from `src/store.ts`; `RemoteOp` from Task 4; `newId` from `src/lib/id.ts`
- Produces:
  - `type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`
  - `memoryStore(): KeyValueStore`
  - `browserStore(): KeyValueStore`
  - `cacheKey(userId: string): string`
  - `queueKey(userId: string): string`
  - `readCache(store: KeyValueStore, userId: string): AppData | null`
  - `writeCache(store: KeyValueStore, userId: string, data: AppData): void`
  - `clearUser(store: KeyValueStore, userId: string): void`
  - `replay(base: AppData, actions: Action[]): AppData`
  - `interface QueueEntry { id: string; action: Action; ops: RemoteOp[]; attempts: number }`
  - `type SendOutcome = { result: 'ok' } | { result: 'retry'; message: string } | { result: 'auth' } | { result: 'reject'; message: string }`
  - `type QueuePhase = 'idle' | 'sending' | 'waiting' | 'paused'`
  - `backoff(attempts: number): number`
  - `class SyncQueue`, with constructor options `{ store, key, send, onChange, onSent, onReject, onDrained }`, members `entries`, `pending`, `phase` and `lastError`, and methods `enqueue(action, ops)`, `kick()`, `resume()` and `dispose()`

- [ ] **Step 1: Write the failing local tests**

Create `src/sync/local.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { cacheKey, clearUser, memoryStore, queueKey, readCache, replay, writeCache } from './local';

const board: AppData = {
  version: 1,
  exercises: [{ id: 'a', name: 'Squat', pinned: true, createdAt: 1 }],
  sets: [{ id: 's', exerciseId: 'a', date: '2026-09-20', weight: 100, reps: 5, createdAt: 2 }],
  settings: { unit: 'kg' },
};

describe('board cache', () => {
  it('keeps one cache per user', () => {
    const store = memoryStore();
    writeCache(store, 'u1', board);
    expect(readCache(store, 'u1')).toEqual(board);
    expect(readCache(store, 'u2')).toBeNull();
  });

  it('treats a corrupt cache as missing', () => {
    const store = memoryStore();
    store.setItem(cacheKey('u1'), '{not json');
    expect(readCache(store, 'u1')).toBeNull();
  });

  it('clears a user’s cache and queue', () => {
    const store = memoryStore();
    writeCache(store, 'u1', board);
    store.setItem(queueKey('u1'), '[]');
    clearUser(store, 'u1');
    expect(store.getItem(cacheKey('u1'))).toBeNull();
    expect(store.getItem(queueKey('u1'))).toBeNull();
  });
});

describe('replay', () => {
  it('applies pending actions on top of the server board', () => {
    const next = replay(board, [
      { type: 'addSet', set: { id: 't', exerciseId: 'a', date: '2026-09-21', weight: 105, reps: 3, createdAt: 3 } },
      { type: 'settings', patch: { unit: 'lb' } },
    ]);
    expect(next.sets.map((s) => s.id)).toEqual(['s', 't']);
    expect(next.settings.unit).toBe('lb');
  });

  it('does not duplicate a set the server already has', () => {
    expect(replay(board, [{ type: 'addSet', set: board.sets[0] }]).sets).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Write the failing queue tests**

Create `src/sync/queue.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '../store';
import { memoryStore } from './local';
import type { RemoteOp } from './ops';
import { SyncQueue, backoff, type SendOutcome } from './queue';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const op = (id: string): RemoteOp => ({ kind: 'deleteSet', id });
const act = (id: string): Action => ({ type: 'deleteSet', id });
const idOf = (a: Action) => (a as { id: string }).id;

function harness(send: (op: RemoteOp) => Promise<SendOutcome>) {
  const store = memoryStore();
  const sent: string[] = [];
  const rejected: string[] = [];
  const drained: boolean[] = [];
  const make = () =>
    new SyncQueue({
      store,
      key: 'q',
      send,
      onChange: () => {},
      onSent: (e) => sent.push(idOf(e.action)),
      onReject: (e, message) => rejected.push(`${idOf(e.action)}:${message}`),
      onDrained: (hadRejects) => drained.push(hadRejects),
    });
  return { store, sent, rejected, drained, make };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('backoff', () => {
  it('doubles from two seconds and caps at a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoff)).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });
});

describe('SyncQueue', () => {
  it('sends entries in order and reports when drained', async () => {
    const calls: string[] = [];
    const h = harness(async (o) => {
      calls.push((o as { id: string }).id);
      return { result: 'ok' };
    });
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    q.enqueue(act('b'), [op('b')]);
    await flush();
    expect(calls).toEqual(['a', 'b']);
    expect(h.sent).toEqual(['a', 'b']);
    expect(q.pending).toBe(0);
    expect(q.phase).toBe('idle');
    expect(h.drained).toEqual([false]);
  });

  it('keeps unsent entries in storage across a restart', async () => {
    const h = harness(async () => ({ result: 'retry', message: 'offline' }));
    const first = h.make();
    first.enqueue(act('a'), [op('a')]);
    await flush();
    first.dispose();
    const second = h.make();
    expect(second.entries.map((e) => idOf(e.action))).toEqual(['a']);
    expect(second.entries[0].attempts).toBe(1);
    second.dispose();
  });

  it('retries after the backoff delay', async () => {
    let fail = true;
    const h = harness(async () => (fail ? { result: 'retry', message: 'offline' } : { result: 'ok' }));
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    await flush();
    expect(q.phase).toBe('waiting');
    expect(q.lastError).toBe('offline');
    fail = false;
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(h.sent).toEqual(['a']);
    expect(q.phase).toBe('idle');
  });

  it('retries immediately when kicked', async () => {
    let fail = true;
    const h = harness(async () => (fail ? { result: 'retry', message: 'offline' } : { result: 'ok' }));
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    await flush();
    fail = false;
    q.kick();
    await flush();
    expect(h.sent).toEqual(['a']);
  });

  it('treats a thrown send as retryable', async () => {
    const h = harness(async () => {
      throw new Error('boom');
    });
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    await flush();
    expect(q.phase).toBe('waiting');
    expect(q.lastError).toBe('boom');
    expect(q.pending).toBe(1);
    q.dispose();
  });

  it('drops a rejected entry, reports it and keeps going', async () => {
    const h = harness(async (o) => ((o as { id: string }).id === 'a' ? { result: 'reject', message: 'bad' } : { result: 'ok' }));
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    q.enqueue(act('b'), [op('b')]);
    await flush();
    expect(h.rejected).toEqual(['a:bad']);
    expect(h.sent).toEqual(['b']);
    expect(h.drained).toEqual([true]);
  });

  it('pauses on an auth failure until resumed', async () => {
    let auth = true;
    const h = harness(async () => (auth ? { result: 'auth' } : { result: 'ok' }));
    const q = h.make();
    q.enqueue(act('a'), [op('a')]);
    await flush();
    expect(q.phase).toBe('paused');
    q.kick();
    await flush();
    expect(h.sent).toEqual([]);
    auth = false;
    q.resume();
    await flush();
    expect(h.sent).toEqual(['a']);
  });

  it('only removes an entry once every one of its ops succeeds', async () => {
    const calls: string[] = [];
    let failSecond = true;
    const h = harness(async (o) => {
      const id = (o as { id: string }).id;
      calls.push(id);
      if (id === 'a2' && failSecond) {
        failSecond = false;
        return { result: 'retry', message: 'blip' };
      }
      return { result: 'ok' };
    });
    const q = h.make();
    q.enqueue(act('a'), [op('a1'), op('a2')]);
    await flush();
    expect(q.pending).toBe(1);
    q.kick();
    await flush();
    expect(calls).toEqual(['a1', 'a2', 'a1', 'a2']);
    expect(h.sent).toEqual(['a']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/sync/local.test.ts src/sync/queue.test.ts`
Expected: FAIL, because `./local` and `./queue` can't be resolved.

- [ ] **Step 4: Implement local**

Create `src/sync/local.ts`:

```ts
import { parseData, reducer, type Action } from '../store';
import type { AppData } from '../types';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export function browserStore(): KeyValueStore {
  try {
    const store = window.localStorage;
    store.getItem('strengthboard:probe');
    return store;
  } catch {
    return memoryStore();
  }
}

export const cacheKey = (userId: string) => `strengthboard:cache:${userId}`;
export const queueKey = (userId: string) => `strengthboard:queue:${userId}`;

export function readCache(store: KeyValueStore, userId: string): AppData | null {
  try {
    const raw = store.getItem(cacheKey(userId));
    return raw ? parseData(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCache(store: KeyValueStore, userId: string, data: AppData): void {
  try {
    store.setItem(cacheKey(userId), JSON.stringify(data));
  } catch {}
}

export function clearUser(store: KeyValueStore, userId: string): void {
  try {
    store.removeItem(cacheKey(userId));
    store.removeItem(queueKey(userId));
  } catch {}
}

export function replay(base: AppData, actions: Action[]): AppData {
  return actions.reduce(reducer, base);
}
```

- [ ] **Step 5: Implement the queue**

Create `src/sync/queue.ts`:

```ts
import type { Action } from '../store';
import { newId } from '../lib/id';
import type { KeyValueStore } from './local';
import type { RemoteOp } from './ops';

export interface QueueEntry {
  id: string;
  action: Action;
  ops: RemoteOp[];
  attempts: number;
}

export type SendOutcome =
  | { result: 'ok' }
  | { result: 'retry'; message: string }
  | { result: 'auth' }
  | { result: 'reject'; message: string };

export type QueuePhase = 'idle' | 'sending' | 'waiting' | 'paused';

export interface QueueOptions {
  store: KeyValueStore;
  key: string;
  send: (op: RemoteOp) => Promise<SendOutcome>;
  onChange: () => void;
  onSent: (entry: QueueEntry) => void;
  onReject: (entry: QueueEntry, message: string) => void;
  onDrained: (hadRejects: boolean) => void;
}

export function backoff(attempts: number): number {
  return Math.min(2000 * 2 ** Math.max(0, attempts - 1), 60000);
}

function load(store: KeyValueStore, key: string): QueueEntry[] {
  try {
    const raw = store.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

export class SyncQueue {
  phase: QueuePhase = 'idle';
  lastError: string | null = null;
  private opts: QueueOptions;
  private list: QueueEntry[];
  private running = false;
  private paused = false;
  private disposed = false;
  private rejects = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: QueueOptions) {
    this.opts = opts;
    this.list = load(opts.store, opts.key);
  }

  get entries(): readonly QueueEntry[] {
    return this.list;
  }

  get pending(): number {
    return this.list.length;
  }

  enqueue(action: Action, ops: RemoteOp[]): QueueEntry {
    const entry: QueueEntry = { id: newId(), action, ops, attempts: 0 };
    this.list.push(entry);
    this.persist();
    this.opts.onChange();
    this.kick();
    return entry;
  }

  kick(): void {
    if (this.disposed || this.paused) return;
    this.clearTimer();
    void this.drain();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.kick();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private persist(): void {
    try {
      this.opts.store.setItem(this.opts.key, JSON.stringify(this.list));
    } catch {}
  }

  private setPhase(phase: QueuePhase, error: string | null): void {
    this.phase = phase;
    this.lastError = error;
    this.opts.onChange();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.list.length && !this.disposed && !this.paused) {
      const entry = this.list[0];
      this.setPhase('sending', this.lastError);
      let outcome: SendOutcome = { result: 'ok' };
      for (const op of entry.ops) {
        try {
          outcome = await this.opts.send(op);
        } catch (err) {
          outcome = { result: 'retry', message: err instanceof Error ? err.message : String(err) };
        }
        if (outcome.result !== 'ok') break;
      }
      if (this.disposed) break;
      if (outcome.result === 'ok' || outcome.result === 'reject') {
        this.list.shift();
        this.persist();
        this.lastError = null;
        if (outcome.result === 'ok') this.opts.onSent(entry);
        else {
          this.rejects = true;
          this.opts.onReject(entry, outcome.message);
        }
        this.opts.onChange();
        continue;
      }
      if (outcome.result === 'auth') {
        this.paused = true;
        this.setPhase('paused', null);
        break;
      }
      entry.attempts += 1;
      this.persist();
      this.setPhase('waiting', outcome.message);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.drain();
      }, backoff(entry.attempts));
      break;
    }
    this.running = false;
    if (!this.list.length && !this.disposed) {
      const hadRejects = this.rejects;
      this.rejects = false;
      this.setPhase('idle', null);
      this.opts.onDrained(hadRejects);
    }
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/sync/local.test.ts src/sync/queue.test.ts`
Expected: PASS (5 local and 9 queue tests).

- [ ] **Step 7: Run all tests and build, then stage**

Run: `npm test && npm run build`

```bash
git add src/sync/local.ts src/sync/local.test.ts src/sync/queue.ts src/sync/queue.test.ts
```

---

### Task 6: Supabase client, response classification, fetch and send

**Files:**
- Create: `src/supabase.ts`, `src/env.d.ts`, `src/sync/classify.ts`, `src/sync/classify.test.ts`, `src/sync/remote.ts`, `.env.example`
- Modify: `package.json` (dependency)

**Interfaces:**
- Consumes: `RemoteOp` (Task 4); `SendOutcome` (Task 5); `boardFromDb`, `DbExercise`, `DbSet` (Task 3)
- Produces:
  - `supabase` (a `SupabaseClient`) and `supabaseConfigured: boolean`
  - `classify(status: number, error: { message: string; code?: string } | null): SendOutcome`
  - `fetchBoard(): Promise<AppData>`
  - `sendOp(op: RemoteOp, userId: string): Promise<SendOutcome>`

- [ ] **Step 1: Install supabase-js**

Run: `npm install @supabase/supabase-js`
Expected: `package.json` dependencies include `@supabase/supabase-js`.

- [ ] **Step 2: Write the failing classify tests**

Create `src/sync/classify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classify } from './classify';

const err = (message: string, code = '') => ({ message, code });

describe('classify', () => {
  it('treats no error as success', () => {
    expect(classify(201, null)).toEqual({ result: 'ok' });
  });

  it('pauses on expired or missing auth', () => {
    expect(classify(401, err('JWT expired'))).toEqual({ result: 'auth' });
    expect(classify(400, err('JWT expired', 'PGRST301'))).toEqual({ result: 'auth' });
    expect(classify(400, err('no auth', 'PGRST303'))).toEqual({ result: 'auth' });
  });

  it('retries network failures, timeouts, rate limits and server errors', () => {
    expect(classify(0, err('TypeError: Failed to fetch'))).toEqual({ result: 'retry', message: 'TypeError: Failed to fetch' });
    expect(classify(408, err('timeout')).result).toBe('retry');
    expect(classify(429, err('slow down')).result).toBe('retry');
    expect(classify(503, err('unavailable')).result).toBe('retry');
  });

  it('rejects other client errors so the queue can move on', () => {
    expect(classify(400, err('violates check constraint', '23514'))).toEqual({ result: 'reject', message: 'violates check constraint' });
    expect(classify(403, err('row-level security', '42501')).result).toBe('reject');
    expect(classify(409, err('foreign key', '23503')).result).toBe('reject');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/sync/classify.test.ts`
Expected: FAIL, because `./classify` can't be resolved.

- [ ] **Step 4: Implement classify**

Create `src/sync/classify.ts`:

```ts
import type { SendOutcome } from './queue';

export function classify(status: number, error: { message: string; code?: string } | null): SendOutcome {
  if (!error) return { result: 'ok' };
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') return { result: 'auth' };
  if (status === 0 || status === 408 || status === 429 || status >= 500) return { result: 'retry', message: error.message };
  return { result: 'reject', message: error.message };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sync/classify.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Add env typing, the example env file and the client**

Create `src/env.d.ts`:

```ts
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
```

Create `.env.example`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Create `src/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost:54321', key || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
```

- [ ] **Step 7: Implement remote**

Create `src/sync/remote.ts`:

```ts
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
```

- [ ] **Step 8: Run all tests and build**

Run: `npm test && npm run build`
Expected: all pass. The build succeeds even without `.env.local`.

- [ ] **Step 9: Stage**

```bash
git add package.json package-lock.json src/supabase.ts src/env.d.ts src/sync/classify.ts src/sync/classify.test.ts src/sync/remote.ts .env.example
```

---

### Task 7: Sign-in, create account, reset password

**Files:**
- Create: `src/auth/passwords.ts`, `src/auth/passwords.test.ts`, `src/auth/AuthProvider.tsx`, `src/auth/AuthLayout.tsx`, `src/auth/AuthScreen.tsx`, `src/auth/SetNewPassword.tsx`, `src/components/Logo.tsx`, `src/Root.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `supabase` and `supabaseConfigured` (Task 6)
- Produces:
  - `MIN_PASSWORD_LENGTH = 8`
  - `checkNewPassword(password: string, confirm: string): PasswordErrors`, where `PasswordErrors = { password?: string; confirm?: string }`
  - `checkEmail(email: string): string | undefined`
  - `friendlyAuthError(message: string): string`
  - `interface AuthUser { id: string; email: string }`
  - `useAuth(): { status: 'loading' | 'signedOut' | 'signedIn'; user: AuthUser | null; recovering: boolean; finishRecovery: () => void }`
  - `AuthProvider`
  - `Logo`
  - `Root`

- [ ] **Step 1: Write the failing password tests**

Create `src/auth/passwords.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkEmail, checkNewPassword, friendlyAuthError } from './passwords';

describe('checkNewPassword', () => {
  it('accepts a long enough password typed the same twice', () => {
    expect(checkNewPassword('squat-405', 'squat-405')).toEqual({});
  });

  it('asks for at least 8 characters', () => {
    expect(checkNewPassword('short', 'short')).toEqual({ password: 'Use at least 8 characters' });
  });

  it('catches a mismatch, including an empty confirmation', () => {
    expect(checkNewPassword('squat-405', 'squat-406')).toEqual({ confirm: 'Passwords don’t match' });
    expect(checkNewPassword('squat-405', '')).toEqual({ confirm: 'Passwords don’t match' });
  });
});

describe('checkEmail', () => {
  it('accepts a normal address and trims spaces', () => {
    expect(checkEmail(' lifter@example.com ')).toBeUndefined();
  });

  it('rejects anything that is not an address', () => {
    expect(checkEmail('lifter')).toBe('Enter a valid email address');
    expect(checkEmail('')).toBe('Enter a valid email address');
  });
});

describe('friendlyAuthError', () => {
  it('rewrites Supabase messages into plain language', () => {
    expect(friendlyAuthError('Invalid login credentials')).toBe('Wrong email or password');
    expect(friendlyAuthError('Email not confirmed')).toBe('Confirm your email first. Check your inbox for the link.');
    expect(friendlyAuthError('User already registered')).toBe('An account with this email already exists. Sign in instead.');
    expect(friendlyAuthError('Email rate limit exceeded')).toBe('Too many attempts. Wait a minute and try again.');
    expect(friendlyAuthError('TypeError: Failed to fetch')).toBe('Can’t reach the server. Check your connection.');
  });

  it('passes unknown messages through', () => {
    expect(friendlyAuthError('Something odd')).toBe('Something odd');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/auth/passwords.test.ts`
Expected: FAIL, because `./passwords` can't be resolved.

- [ ] **Step 3: Implement passwords**

Create `src/auth/passwords.ts`:

```ts
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordErrors {
  password?: string;
  confirm?: string;
}

export function checkNewPassword(password: string, confirm: string): PasswordErrors {
  const errors: PasswordErrors = {};
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  else if (confirm !== password) errors.confirm = 'Passwords don’t match';
  return errors;
}

export function checkEmail(email: string): string | undefined {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : 'Enter a valid email address';
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password';
  if (m.includes('email not confirmed')) return 'Confirm your email first. Check your inbox for the link.';
  if (m.includes('already registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection.';
  return message;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/auth/passwords.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Extract Logo**

Create `src/components/Logo.tsx`:

```tsx
export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--lb-surface-3)" />
      <path d="M5 22l6-7 5 4 11-11" fill="none" stroke="var(--lb-accent-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

In `src/App.tsx`, delete the local `function Logo() { ... }` block and add this import below the `./components/Toasts` import:

```ts
import { Logo } from './components/Logo';
```

- [ ] **Step 6: Create the auth provider**

Create `src/auth/AuthProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../supabase';

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  recovering: boolean;
  finishRecovery: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabaseConfigured ? 'loading' : 'signedOut');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const apply = (session: Session | null) => {
      const u = session?.user;
      setUser((prev) => {
        if (!u) return null;
        const email = u.email ?? '';
        return prev && prev.id === u.id && prev.email === email ? prev : { id: u.id, email };
      });
      setStatus(u ? 'signedIn' : 'signedOut');
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      apply(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, recovering, finishRecovery: () => setRecovering(false) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
```

- [ ] **Step 7: Create the shared auth layout**

Create `src/auth/AuthLayout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Logo } from '../components/Logo';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight text-fg">StrengthBoard</span>
      </div>
      <section aria-labelledby="auth-title" className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-pop">
        <h1 id="auth-title" className="mb-4 text-base font-semibold text-fg">
          {title}
        </h1>
        {children}
      </section>
    </main>
  );
}
```

- [ ] **Step 8: Create the sign-in / create-account screen**

Create `src/auth/AuthScreen.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { supabase } from '../supabase';
import { AuthLayout } from './AuthLayout';
import { checkEmail, checkNewPassword, friendlyAuthError } from './passwords';

type Mode = 'signIn' | 'signUp' | 'forgot' | 'checkEmail' | 'resetSent';

interface Errors {
  email?: string;
  password?: string;
  confirm?: string;
  form?: string;
}

const TITLES: Record<Mode, string> = {
  signIn: 'Sign in',
  signUp: 'Create account',
  forgot: 'Reset password',
  checkEmail: 'Check your email',
  resetSent: 'Check your email',
};

const SUBMIT: Record<'signIn' | 'signUp' | 'forgot', string> = {
  signIn: 'Sign in',
  signUp: 'Create account',
  forgot: 'Send reset link',
};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-xs text-danger">
      {message}
    </p>
  ) : null;
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function go(next: Mode) {
    setMode(next);
    setErrors({});
    setPassword('');
    setConfirm('');
  }

  function validate(): Errors {
    const next: Errors = { email: checkEmail(email) };
    if (mode === 'signIn' && !password) next.password = 'Enter your password';
    if (mode === 'signUp') Object.assign(next, checkNewPassword(password, confirm));
    return next;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (next.email || next.password || next.confirm) return;
    setBusy(true);
    try {
      const address = email.trim();
      const redirect = window.location.origin;
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error) setErrors({ form: friendlyAuthError(error.message) });
      } else if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: redirect } });
        if (error) setErrors({ form: friendlyAuthError(error.message) });
        else if (!data.session) go('checkEmail');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: redirect });
        if (error) setErrors({ form: friendlyAuthError(error.message) });
        else go('resetSent');
      }
    } catch (err) {
      setErrors({ form: friendlyAuthError(err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'checkEmail' || mode === 'resetSent') {
    return (
      <AuthLayout title={TITLES[mode]}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-text">
            <MailCheck size={20} aria-hidden="true" />
          </span>
          <p className="text-sm text-muted">
            {mode === 'checkEmail'
              ? `We sent a confirmation link to ${email.trim()}. Open it to activate your account, then sign in.`
              : `If an account exists for ${email.trim()}, we sent it a link to reset the password.`}
          </p>
          <button type="button" onClick={() => go('signIn')} className="btn btn-outline mt-1 w-full">
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={TITLES[mode]}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div>
          <label htmlFor="auth-email" className="label">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'auth-email-err' : undefined}
            className="field"
          />
          <FieldError id="auth-email-err" message={errors.email} />
        </div>
        {mode !== 'forgot' && (
          <div>
            <label htmlFor="auth-password" className="label">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'auth-password-err' : undefined}
              className="field"
            />
            <FieldError id="auth-password-err" message={errors.password} />
          </div>
        )}
        {mode === 'signUp' && (
          <div>
            <label htmlFor="auth-confirm" className="label">
              Confirm password
            </label>
            <input
              id="auth-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm}
              aria-describedby={errors.confirm ? 'auth-confirm-err' : undefined}
              className="field"
            />
            <FieldError id="auth-confirm-err" message={errors.confirm} />
          </div>
        )}
        {errors.form && (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary mt-1 w-full">
          {busy ? 'Please wait…' : SUBMIT[mode]}
        </button>
      </form>
      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted">
        {mode === 'signIn' ? (
          <>
            <button type="button" onClick={() => go('forgot')} className="text-accent-text hover:underline">
              Forgot password?
            </button>
            <p>
              New here?{' '}
              <button type="button" onClick={() => go('signUp')} className="font-medium text-accent-text hover:underline">
                Create an account
              </button>
            </p>
          </>
        ) : (
          <p>
            Already have an account?{' '}
            <button type="button" onClick={() => go('signIn')} className="font-medium text-accent-text hover:underline">
              Sign in
            </button>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
```

- [ ] **Step 9: Create the set-new-password screen**

Create `src/auth/SetNewPassword.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';
import { checkNewPassword, friendlyAuthError, type PasswordErrors } from './passwords';

export function SetNewPassword() {
  const { finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<PasswordErrors & { form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = checkNewPassword(password, confirm);
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setErrors({ form: friendlyAuthError(error.message) });
    else finishRecovery();
  }

  return (
    <AuthLayout title="Set a new password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div>
          <label htmlFor="new-password" className="label">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'new-password-err' : undefined}
            className="field"
          />
          {errors.password && (
            <p id="new-password-err" className="mt-1 text-xs text-danger">
              {errors.password}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="new-confirm" className="label">
            Confirm new password
          </label>
          <input
            id="new-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? 'new-confirm-err' : undefined}
            className="field"
          />
          {errors.confirm && (
            <p id="new-confirm-err" className="mt-1 text-xs text-danger">
              {errors.confirm}
            </p>
          )}
        </div>
        {errors.form && (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary mt-1 w-full">
          {busy ? 'Please wait…' : 'Save password'}
        </button>
        <button type="button" onClick={finishRecovery} className="btn btn-ghost w-full">
          Cancel
        </button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 10: Create Root and wire main**

Create `src/Root.tsx`:

```tsx
import App from './App';
import { AuthLayout } from './auth/AuthLayout';
import { AuthScreen } from './auth/AuthScreen';
import { useAuth } from './auth/AuthProvider';
import { SetNewPassword } from './auth/SetNewPassword';
import { Logo } from './components/Logo';
import { supabaseConfigured } from './supabase';

function SetupNotice() {
  return (
    <AuthLayout title="Connect Supabase">
      <p className="text-sm text-muted">
        Copy <code className="font-mono text-fg">.env.example</code> to <code className="font-mono text-fg">.env.local</code>, fill in your
        project URL and publishable key, then restart <code className="font-mono text-fg">npm run dev</code>. The README has the full
        setup steps.
      </p>
    </AuthLayout>
  );
}

function Splash() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <Logo />
      <span className="sr-only">Loading</span>
    </main>
  );
}

export function Root() {
  const { status, user, recovering } = useAuth();
  if (!supabaseConfigured) return <SetupNotice />;
  if (status === 'loading') return <Splash />;
  if (recovering && user) return <SetNewPassword />;
  if (status !== 'signedIn' || !user) return <AuthScreen />;
  return <App key={user.id} />;
}
```

In `src/main.tsx`, replace:

```tsx
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

with:

```tsx
import { AuthProvider } from './auth/AuthProvider';
import { Root } from './Root';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 11: Run all tests and build**

Run: `npm test && npm run build`
Expected: all pass.

- [ ] **Step 12: Check the setup notice in the browser**

Start the dev server with no `.env.local` and open it.
Expected: the "Connect Supabase" card appears, the console shows no errors, and the board does not appear.

- [ ] **Step 13: Stage**

```bash
git add src/auth src/components/Logo.tsx src/Root.tsx src/main.tsx src/App.tsx
```

---

### Task 8: Synced store, sync status and account menu

**Files:**
- Create: `src/sync/useSyncedStore.ts`, `src/components/SyncStatus.tsx`, `src/components/AccountMenu.tsx`
- Modify: `src/App.tsx`, `src/Root.tsx`, `src/store.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–7
- Produces:
  - `interface SyncState { pending: number; phase: QueuePhase; online: boolean; error: string | null; loaded: boolean }`
  - `useSyncedStore(userId: string, notify: (message: string) => void): { data: AppData; dispatch: (action: Action) => void; sync: SyncState; signOut: () => Promise<void> }`
  - `SyncStatus({ sync })`
  - `AccountMenu({ email, pending, onSignOut })`
  - `App({ user }: { user: AuthUser })`

- [ ] **Step 1: Create the synced store hook**

Create `src/sync/useSyncedStore.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyData, reducer, type Action } from '../store';
import { supabase } from '../supabase';
import type { AppData } from '../types';
import { browserStore, clearUser, queueKey, readCache, replay, writeCache } from './local';
import { toRemoteOps } from './ops';
import { SyncQueue, type QueueEntry, type QueuePhase } from './queue';
import { fetchBoard, sendOp } from './remote';

export interface SyncState {
  pending: number;
  phase: QueuePhase;
  online: boolean;
  error: string | null;
  loaded: boolean;
}

export function useSyncedStore(userId: string, notify: (message: string) => void) {
  const store = useMemo(() => browserStore(), []);
  const [server, setServer] = useState<AppData | null>(() => readCache(store, userId));
  const [entries, setEntries] = useState<readonly QueueEntry[]>([]);
  const [phase, setPhase] = useState<QueuePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [fetched, setFetched] = useState(false);
  const queueRef = useRef<SyncQueue | null>(null);
  const stateRef = useRef<AppData>(server ?? emptyData());
  const sentVersion = useRef(0);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const refresh = useCallback(async () => {
    const q = queueRef.current;
    if (!q) return;
    if (q.pending === 0) {
      const version = sentVersion.current;
      try {
        const board = await fetchBoard();
        if (queueRef.current === q && sentVersion.current === version && q.pending === 0) setServer(board);
      } catch {}
    }
    setFetched(true);
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (server) writeCache(store, userId, server);
  }, [server, store, userId]);

  useEffect(() => {
    const q = new SyncQueue({
      store,
      key: queueKey(userId),
      send: (op) => sendOp(op, userId),
      onChange: () => {
        setEntries([...q.entries]);
        setPhase(q.phase);
        setError(q.lastError);
      },
      onSent: (entry) => {
        sentVersion.current += 1;
        setServer((prev) => reducer(prev ?? emptyData(), entry.action));
      },
      onReject: (_entry, message) => notifyRef.current(`Couldn’t save a change: ${message}`),
      onDrained: (hadRejects) => {
        if (hadRejects) void refreshRef.current();
      },
    });
    queueRef.current = q;
    setEntries([...q.entries]);
    q.kick();
    void refreshRef.current();

    const onOnline = () => {
      setOnline(true);
      q.kick();
      void refreshRef.current();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      q.kick();
      void refreshRef.current();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') q.resume();
    });

    return () => {
      q.dispose();
      if (queueRef.current === q) queueRef.current = null;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      auth.subscription.unsubscribe();
    };
  }, [store, userId]);

  const data = useMemo(() => replay(server ?? emptyData(), entries.map((e) => e.action)), [server, entries]);
  stateRef.current = data;

  const dispatch = useCallback((action: Action) => {
    const q = queueRef.current;
    if (!q) return;
    const after = reducer(stateRef.current, action);
    stateRef.current = after;
    q.enqueue(action, toRemoteOps(action, after));
  }, []);

  const signOut = useCallback(async () => {
    queueRef.current?.dispose();
    queueRef.current = null;
    clearUser(store, userId);
    await supabase.auth.signOut({ scope: 'local' });
  }, [store, userId]);

  const sync: SyncState = { pending: entries.length, phase, online, error, loaded: server !== null || fetched };
  return { data, dispatch, sync, signOut };
}
```

- [ ] **Step 2: Create the sync status**

Create `src/components/SyncStatus.tsx`:

```tsx
import { AlertTriangle, CloudCheck, CloudOff, RefreshCw, type LucideIcon } from 'lucide-react';
import type { SyncState } from '../sync/useSyncedStore';

function describe({ pending, phase, online }: SyncState): { Icon: LucideIcon; label: string; warn: boolean; spin: boolean } {
  if (!online) return { Icon: CloudOff, label: pending > 0 ? `Offline · ${pending} waiting` : 'Offline', warn: pending > 0, spin: false };
  if (phase === 'paused') return { Icon: AlertTriangle, label: 'Reconnecting to your account', warn: true, spin: false };
  if (phase === 'waiting') return { Icon: AlertTriangle, label: 'Couldn’t save · retrying', warn: true, spin: false };
  if (pending > 0 || phase === 'sending') return { Icon: RefreshCw, label: 'Saving…', warn: false, spin: true };
  return { Icon: CloudCheck, label: 'Saved', warn: false, spin: false };
}

export function SyncStatus({ sync }: { sync: SyncState }) {
  const { Icon, label, warn, spin } = describe(sync);
  return (
    <span
      role="status"
      aria-live="polite"
      title={sync.error ?? label}
      className={`mr-1 inline-flex items-center gap-1.5 text-xs ${warn ? 'text-warn' : 'text-muted'}`}
    >
      <Icon size={14} aria-hidden="true" className={spin ? 'animate-spin motion-reduce:animate-none' : undefined} />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}
```

- [ ] **Step 3: Create the account menu**

Create `src/components/AccountMenu.tsx`:

```tsx
import { LogOut, UserRound } from 'lucide-react';
import { Menu } from './Menu';

export function AccountMenu({ email, pending, onSignOut }: { email: string; pending: number; onSignOut: () => void }) {
  function signOut() {
    if (pending > 0) {
      const what = pending === 1 ? '1 change hasn’t' : `${pending} changes haven’t`;
      if (!window.confirm(`${what} uploaded yet and will be lost if you sign out. Sign out anyway?`)) return;
    }
    onSignOut();
  }

  return (
    <Menu
      label="Account"
      trigger={<UserRound size={16} aria-hidden="true" />}
      items={[
        { label: email || 'Signed in', icon: <UserRound size={14} />, onSelect: () => {}, disabled: true },
        { label: 'Sign out', icon: <LogOut size={14} />, onSelect: signOut, separator: true },
      ]}
    />
  );
}
```

- [ ] **Step 4: Switch App to the synced store**

In `src/App.tsx`:

Replace `import { emptyData, parseData, useStore } from './store';` with:

```ts
import { emptyData, parseData } from './store';
import { useSyncedStore } from './sync/useSyncedStore';
import type { AuthUser } from './auth/AuthProvider';
import { SyncStatus } from './components/SyncStatus';
import { AccountMenu } from './components/AccountMenu';
```

Replace:

```ts
export default function App() {
  const [data, dispatch] = useStore();
  const { exercises, sets, settings } = data;
  const { unit } = settings;
  const { toasts, push, dismiss } = useToasts();
```

with:

```ts
export default function App({ user }: { user: AuthUser }) {
  const { toasts, push, dismiss } = useToasts();
  const { data, dispatch, sync, signOut } = useSyncedStore(user.id, push);
  const { exercises, sets, settings } = data;
  const { unit } = settings;
```

In `clearAll`, replace:

```ts
    if (!window.confirm('Delete every lift and set on this device? You can undo right after.')) return;
```

with:

```ts
    if (!window.confirm('Delete every lift and set in your account? You can undo right after.')) return;
```

In the header, replace `<div className="ml-auto flex items-center gap-1">` with:

```tsx
          <div className="ml-auto flex items-center gap-1">
            <SyncStatus sync={sync} />
```

Replace:

```tsx
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importData} />
```

with:

```tsx
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importData} />
            <AccountMenu email={user.email} pending={sync.pending} onSignOut={() => void signOut()} />
```

Replace the empty-state opening:

```tsx
          {isEmpty ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
```

with:

```tsx
          {isEmpty && !sync.loaded ? (
            <div className="px-6 py-14 text-center text-sm text-muted" aria-busy="true">
              Loading your board…
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
```

Replace `the grip to reorder · e1RM uses the Epley formula · data stays in this browser` with:

```tsx
            the grip to reorder · e1RM uses the Epley formula · saved to your account
```

- [ ] **Step 5: Pass the user from Root**

In `src/Root.tsx`, replace `return <App key={user.id} />;` with:

```tsx
  return <App key={user.id} user={user} />;
```

- [ ] **Step 6: Remove the old local-only store**

In `src/store.ts`:
- Delete the first line, `import { useEffect, useReducer } from 'react';`.
- Delete `export const STORAGE_KEY = 'strengthboard:v1';`.
- Delete the whole `function load(): AppData { ... }` and `export function useStore() { ... }` blocks at the end of the file.

- [ ] **Step 7: Run all tests and build**

Run: `npm test && npm run build`
Expected: all pass. TypeScript reports no unused imports and no references to `useStore` or `STORAGE_KEY`.

- [ ] **Step 8: Stage**

```bash
git add src/sync/useSyncedStore.ts src/components/SyncStatus.tsx src/components/AccountMenu.tsx src/App.tsx src/Root.tsx src/store.ts
```

---

### Task 9: README setup guide

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the Data section**

In `README.md`, replace the whole `## Data` section (from `## Data` up to, but not including, `## Design notes`) with:

````markdown
## Accounts and data

You sign in with email and password, and your lifts, sets and lb/kg choice live in your StrengthBoard account (Supabase). They show up on any device you sign in on. Light/dark theme is per device.

Changes appear instantly and upload in the background. With no signal, they wait on the device and upload when you're back online. The header shows **Saved**, **Saving…**, **Offline · N waiting** or **Couldn't save · retrying**. Other devices' changes appear when you reopen or switch back to the app.

The ⋯ menu can export or import a JSON backup, or clear the board. Import uploads the backup into your account.

```ts
Exercise   { id, name, category?, pinned, createdAt }
WorkoutSet { id, exerciseId, date: 'YYYY-MM-DD', weight, reps, rpe?, notes?, createdAt }
```

## Setup

1. **Create a Supabase project** at supabase.com. Name it StrengthBoard.
2. **Create the tables.** In the project's SQL Editor, paste the contents of `supabase/migrations/001_init.sql` and run it.
3. **Allow the app's addresses.** Under Authentication → URL Configuration, set Site URL to your deployed address (for example `https://strengthboard.vercel.app`). Add `http://localhost:5173` and the deployed address to Redirect URLs, so confirmation and reset emails link back to the app.
4. **Keep email confirmation on** under Authentication → Sign In / Providers → Email. The built-in email sender is rate-limited, so add your own SMTP there before inviting many people.
5. **Connect the app.** Copy `.env.example` to `.env.local` and fill in the Project URL and the publishable key (Project Settings → API Keys). A legacy anon key also works. `.env.local` is git-ignored.
6. **Run it:** `npm install`, then `npm run dev`.
7. **Deploy on Vercel:** import the GitHub repo, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under Environment Variables, and deploy. Then put the Vercel address into step 3.
````

- [ ] **Step 2: Update the layout listing**

In `README.md`, replace the code block under `## Layout` with:

```
src/
  App.tsx                 board shell, KPIs, filters, drag & drop, shortcuts, backup
  Root.tsx                setup notice, auth screens or the board
  store.ts                reducer and import validation
  auth/                   sign in, create account, reset password, session state
  sync/                   row mapping, remote ops, upload queue, cache, useSyncedStore
  lib/stats.ts            sessions, top sets, Epley e1RM, PR detection, summary
  lib/similarity.ts       fuzzy name matching and aliases, common-lift catalog
  components/             rows, sparkline, log form, history, add exercise, menus, sync status
supabase/
  migrations/001_init.sql tables, row-level security, reorder and replace functions
  tests/schema.test.ts    runs the migration in PGlite and checks the security rules
```

- [ ] **Step 3: Stage**

```bash
git add README.md
```

---

### Task 10: Live verification with the real project

This task needs the user. Claude must not create accounts or type passwords, so the user performs the account steps. Claude drives everything else in the browser pane.

- [ ] **Step 1: The user creates and configures the project**

The user follows README Setup steps 1–5, then restarts `npm run dev`.

- [ ] **Step 2: Confirm the app sees the configuration**

Open the dev server.
Expected: the Sign in card appears, not "Connect Supabase", and the console shows no errors.

- [ ] **Step 3: Check the password mismatch (Claude)**

On Create account, type the email `test@example.com` with different values in the two password fields. These are throwaway strings; no real account is created. Submit.
Expected: "Passwords don’t match" appears under Confirm password, and no network request goes to `/auth/v1/signup`.

- [ ] **Step 4: The user signs up, confirms and signs in**

Expected: after sign-up the "Check your email" screen appears, the confirmation link opens the app, and signing in shows the empty board with the **Add lift** button and **Saved** in the header.

- [ ] **Step 5: Check persistence (Claude, in the signed-in session)**

Add a lift, log two sets, pin it, rename it, then reload.
Expected: everything is still there after the reload. In the Supabase Table Editor, `exercises` and `sets` hold the rows with this user's `user_id`.

- [ ] **Step 6: Check cross-session sync**

The user signs in to the same account in a second browser or on a phone.
Expected: the same board appears. A set logged there appears in the first browser after switching back to its tab.

- [ ] **Step 7: Check offline behavior**

The user sets DevTools → Network → Offline, then logs a set.
Expected: the header reads "Offline · 1 waiting". After switching back to Online, it moves through Saving… to Saved, and a reload still shows the set.

- [ ] **Step 8: Check the forgot-password flow**

The user uses "Forgot password?", opens the email link, and sets a new password, entering it twice.
Expected: the Set a new password screen enforces the match, and signing in with the new password works.

- [ ] **Step 9: Check sign-out**

Sign out from the account menu.
Expected: the sign-in screen appears, and localStorage no longer holds `strengthboard:cache:<userId>` or `strengthboard:queue:<userId>`.

- [ ] **Step 10: Final stage**

Run: `npm test && npm run build && git add -A && git status --short`
Expected: all pass, and everything is staged for the user to commit.
