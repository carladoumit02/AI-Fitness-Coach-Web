-- Run in Supabase SQL Editor AFTER initial supabase/schema.sql.
-- Dimitri original V2/V3 feature storage; safe additive schema migration.
-- Requires the project owner to run manually. No usernames/passwords in git.

-- Original dashboard accepts 3 exercises; V2 contains 6.
alter table public.workouts drop constraint if exists workouts_exercise_check;
alter table public.workouts add constraint workouts_exercise_check
  check (exercise in ('squat','pushup','plank','lunge','curl','jack'));

create table if not exists public.user_programs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  program jsonb not null,
  updated_at timestamptz not null default now(),
  constraint program_is_object check (jsonb_typeof(program) = 'object'),
  constraint program_size check (octet_length(program::text) <= 20000)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  voice boolean not null default false,
  adaptive boolean not null default false,
  calibrate boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.program_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  program_name text not null check (char_length(program_name) between 1 and 70),
  rating integer not null check (rating between 0 and 100),
  form_quality integer not null check (form_quality between 0 and 100),
  completion integer not null check (completion between 0 and 100),
  duration_seconds integer not null check (duration_seconds between 0 and 100000),
  exercise_results jsonb not null default '[]'::jsonb check (jsonb_typeof(exercise_results)='array'),
  created_at timestamptz not null default now()
);
create index if not exists program_sessions_user_time on public.program_sessions(user_id,created_at desc);

alter table public.user_programs enable row level security;
alter table public.user_preferences enable row level security;
alter table public.program_sessions enable row level security;

revoke all on public.user_programs,public.user_preferences,public.program_sessions from anon,authenticated;
grant select,insert,update,delete on public.user_programs to authenticated;
grant select,insert,update,delete on public.user_preferences to authenticated;
grant select,insert on public.program_sessions to authenticated;
grant usage,select on sequence public.program_sessions_id_seq to authenticated;

drop policy if exists user_programs_owner on public.user_programs;
create policy user_programs_owner on public.user_programs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists user_preferences_owner on public.user_preferences;
create policy user_preferences_owner on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists program_sessions_own_read on public.program_sessions;
create policy program_sessions_own_read on public.program_sessions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists program_sessions_own_insert on public.program_sessions;
create policy program_sessions_own_insert on public.program_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));

-- RLS is independent of the UI's Admin button. All histories are private.
-- Scores are client-generated educational metrics, and can be manipulated.


-- Full programmed workouts now participate in the overall leaderboard,
-- while exercise filters continue to use individual exercise ratings.
create or replace function public.get_leaderboard(
  p_exercise text default 'all', p_period text default 'all'
)
returns table(user_id uuid,display_name text,best_score integer,sessions_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_exercise not in ('all','squat','pushup','plank','lunge','curl','jack')
    or p_period not in ('all','week','today') then
    raise exception 'Invalid leaderboard filter';
  end if;
  return query
  with entry as (
    select w.user_id,w.exercise,w.rating,w.created_at from public.workouts w
    union all
    select s.user_id,'all'::text as exercise,s.rating,s.created_at
      from public.program_sessions s
  )
  select x.user_id,p.display_name,max(x.rating)::integer,count(*)::bigint
  from entry x join public.profiles p on p.id=x.user_id
  where (p_exercise='all' or x.exercise=p_exercise)
   and (p_period='all'
    or (p_period='week' and x.created_at>=now()-interval '7 days')
    or (p_period='today' and x.created_at>=now()-interval '24 hours'))
  group by x.user_id,p.display_name
  order by max(x.rating) desc,p.display_name asc
  limit 100;
end;
$$;
revoke all on function public.get_leaderboard(text,text) from public,anon;
grant execute on function public.get_leaderboard(text,text) to authenticated;
