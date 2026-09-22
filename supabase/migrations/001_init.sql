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
