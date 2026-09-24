alter table public.sets drop constraint if exists sets_rpe_check;

alter table public.sets rename column rpe to rir;

update public.sets set rir = greatest(0, least(10, 10 - rir)) where rir is not null;

alter table public.sets add constraint sets_rir_check check (rir is null or rir between 0 and 10);

create or replace function public.replace_board(payload jsonb) returns void
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
  insert into public.sets (id, exercise_id, date, weight_kg, reps, rir, notes, created_at)
  select
    (x ->> 'id')::uuid,
    (x ->> 'exercise_id')::uuid,
    (x ->> 'date')::date,
    (x ->> 'weight_kg')::double precision,
    (x ->> 'reps')::smallint,
    (x ->> 'rir')::numeric,
    nullif(x ->> 'notes', ''),
    coalesce((x ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload -> 'sets', '[]'::jsonb)) as x;
end;
$$;
