-- MOTION / LAB web schema. Run ONCE in a new Supabase project's SQL Editor.
-- Authentication uses Supabase Auth; never store passwords in public tables.
-- All functions and policies below enforce roles on the database, not in the UI.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 70),
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise text not null check (exercise in ('squat','pushup','plank')),
  target integer not null check (target between 1 and 300),
  reps integer not null default 0 check (reps between 0 and 10000),
  valid_seconds numeric(8,1) not null default 0 check (valid_seconds between 0 and 100000),
  form_quality integer not null check (form_quality between 0 and 100),
  completion integer not null check (completion between 0 and 100),
  rating integer generated always as (round(form_quality::numeric * completion::numeric / 100)::integer) stored,
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_time_idx on public.workouts (user_id, created_at desc);
create index if not exists workouts_exercise_time_idx on public.workouts (exercise, created_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name,role)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email,'@',1),'Athlete'),70),
    'user'
  );
  return new;
end;
$$;
drop trigger if exists auth_user_created_profile on auth.users;
create trigger auth_user_created_profile after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workouts enable row level security;

-- Members can view public display names, but can edit ONLY their own display name,
-- never their role. Admin privileges cannot be set by registration metadata.
revoke all on table public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;

drop policy if exists profiles_read_signed_in on public.profiles;
create policy profiles_read_signed_in on public.profiles for select to authenticated
using (auth.uid() is not null);
drop policy if exists profiles_edit_own_name on public.profiles;
create policy profiles_edit_own_name on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on table public.workouts from anon, authenticated;
grant select, insert on public.workouts to authenticated;
grant usage, select on sequence public.workouts_id_seq to authenticated;
drop policy if exists workouts_read_own on public.workouts;
create policy workouts_read_own on public.workouts for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists workouts_insert_own on public.workouts;
create policy workouts_insert_own on public.workouts for insert to authenticated
with check (user_id = (select auth.uid()));

-- Leaderboard reveals each person's display name, best rating and session count,
-- NOT their full workout history. Rating is an experimental, client-reported metric.
create or replace function public.get_leaderboard(
  p_exercise text default 'all', p_period text default 'all'
)
returns table(user_id uuid, display_name text, best_score integer, sessions_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_exercise not in ('all','squat','pushup','plank') or p_period not in ('all','week','today') then
    raise exception 'Invalid leaderboard filter';
  end if;
  return query
  select w.user_id, p.display_name, max(w.rating)::integer, count(w.id)::bigint
  from public.workouts as w
  join public.profiles as p on p.id = w.user_id
  where (p_exercise = 'all' or w.exercise = p_exercise)
    and (p_period = 'all'
      or (p_period = 'week' and w.created_at >= now() - interval '7 days')
      or (p_period = 'today' and w.created_at >= now() - interval '24 hours'))
  group by w.user_id, p.display_name
  order by max(w.rating) desc, p.display_name asc
  limit 100;
end;
$$;

-- Only DB-verified admins may inspect accounts or permanently delete them.
create or replace function public.admin_list_users()
returns table(id uuid,display_name text,email text,role text,workout_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Administrator access required';
  end if;
  return query
  select p.id,p.display_name,u.email::text,p.role,count(w.id)::bigint
  from public.profiles p
  join auth.users u on p.id = u.id
  left join public.workouts w on w.user_id = p.id
  group by p.id,p.display_name,u.email,p.role,p.created_at
  order by p.created_at asc;
end;
$$;

create or replace function public.admin_delete_user(p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Administrator access required';
  end if;
  if p_target is null or p_target = auth.uid() then
    raise exception 'You cannot delete your own account here';
  end if;
  if not exists (select 1 from auth.users where id=p_target) then
    raise exception 'User does not exist';
  end if;
  -- Delete from auth.users to revoke access; both profile and workout records
  -- are removed by foreign-key cascades.
  delete from auth.users where id=p_target;
end;
$$;

revoke all on function public.get_leaderboard(text,text) from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.get_leaderboard(text,text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- AFTER signing up for your personal account, make the designated owner admin
-- via the Supabase SQL Editor (never through frontend code):
-- update public.profiles set role='admin'
-- where id=(select id from auth.users where email='you@example.com');
-- Always verify you are assigning admin to the intended email.
