-- SQL support for admin users, pending player approval, and admin dashboard actions.
-- Uses existing tables: profiles, ladder_rankings, matches, courts.

alter table public.profiles
add column if not exists full_name text,
add column if not exists email text,
add column if not exists status text not null default 'approved',
add column if not exists role text not null default 'player';

alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('player', 'admin'));

alter table public.profiles
drop constraint if exists profiles_status_check;

alter table public.profiles
add constraint profiles_status_check
check (status in ('pending', 'approved', 'rejected'));

update public.profiles
set status = 'approved'
where status is null;

alter table public.profiles
alter column status set default 'pending';

alter table public.ladder_rankings
add column if not exists wins integer not null default 0,
add column if not exists losses integer not null default 0;

alter table public.matches
add column if not exists cancel_reason text,
add column if not exists canceled_at timestamptz,
add column if not exists canceled_by uuid references public.profiles(id) on delete set null,
add column if not exists proposed_match_options jsonb not null default '[]'::jsonb,
add column if not exists scheduled_match_ends_at timestamptz,
add column if not exists winner_id uuid references public.profiles(id) on delete set null,
add column if not exists score text,
add column if not exists stats_recorded boolean not null default false,
add column if not exists ranking_updated boolean not null default false;

alter table public.matches
drop constraint if exists matches_status_check;

alter table public.matches
add constraint matches_status_check
check (status in ('pending', 'accepted', 'time_proposed', 'declined', 'scheduled', 'completed', 'canceled', 'expired'));

create unique index if not exists ladder_rankings_player_id_key
on public.ladder_rankings (player_id);

create or replace function public.record_completed_match_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loser_id uuid;
  challenger_rank integer;
  opponent_rank integer;
  updated_count integer;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if new.winner_id is null then
    raise exception 'Completed matches must have a winner.';
  end if;

  if new.winner_id = new.challenger_id then
    loser_id := new.opponent_id;
  elsif new.winner_id = new.opponent_id then
    loser_id := new.challenger_id;
  else
    raise exception 'Winner must be one of the match players.';
  end if;

  if coalesce(old.stats_recorded, false) then
    new.stats_recorded := true;
  else
    update public.ladder_rankings
    set wins = wins + 1
    where player_id = new.winner_id;

    get diagnostics updated_count = row_count;

    if updated_count <> 1 then
      raise exception 'Winner ladder ranking was not found for player_id %.', new.winner_id;
    end if;

    update public.ladder_rankings
    set losses = losses + 1
    where player_id = loser_id;

    get diagnostics updated_count = row_count;

    if updated_count <> 1 then
      raise exception 'Loser ladder ranking was not found for player_id %.', loser_id;
    end if;

    new.stats_recorded := true;
  end if;

  if coalesce(old.ranking_updated, false) then
    new.ranking_updated := true;
    return new;
  end if;

  select rank_position into challenger_rank
  from public.ladder_rankings
  where player_id = new.challenger_id;

  select rank_position into opponent_rank
  from public.ladder_rankings
  where player_id = new.opponent_id;

  if challenger_rank is null then
    raise exception 'Challenger ladder rank_position was not found for player_id %.', new.challenger_id;
  end if;

  if opponent_rank is null then
    raise exception 'Opponent ladder rank_position was not found for player_id %.', new.opponent_id;
  end if;

  if new.winner_id = new.challenger_id and challenger_rank > opponent_rank then
    update public.ladder_rankings
    set rank_position = -1
    where player_id = new.challenger_id;

    get diagnostics updated_count = row_count;

    if updated_count <> 1 then
      raise exception 'Could not temporarily move challenger % during ladder swap.', new.challenger_id;
    end if;

    update public.ladder_rankings
    set rank_position = challenger_rank
    where player_id = new.opponent_id;

    get diagnostics updated_count = row_count;

    if updated_count <> 1 then
      raise exception 'Could not move opponent % to rank_position % during ladder swap.', new.opponent_id, challenger_rank;
    end if;

    update public.ladder_rankings
    set rank_position = opponent_rank
    where player_id = new.challenger_id;

    get diagnostics updated_count = row_count;

    if updated_count <> 1 then
      raise exception 'Could not move challenger % to rank_position % during ladder swap.', new.challenger_id, opponent_rank;
    end if;
  end if;

  new.ranking_updated := true;

  return new;
end;
$$;

drop trigger if exists record_completed_match_stats on public.matches;

create trigger record_completed_match_stats
before update on public.matches
for each row
when (new.status = 'completed')
execute function public.record_completed_match_stats();

create or replace function public.enforce_one_active_match_per_player()
returns trigger
language plpgsql
as $$
begin
  if new.status not in ('pending', 'accepted', 'time_proposed', 'scheduled') then
    return new;
  end if;

  if exists (
    select 1
    from public.matches existing_match
    where existing_match.status in ('pending', 'accepted', 'time_proposed', 'scheduled')
      and (tg_op = 'INSERT' or existing_match.id <> new.id)
      and (
        existing_match.challenger_id = new.challenger_id
        or existing_match.opponent_id = new.challenger_id
        or existing_match.challenger_id = new.opponent_id
        or existing_match.opponent_id = new.opponent_id
      )
  ) then
    raise exception 'You already have an active match. Complete or cancel it before starting another.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_one_active_match_per_player on public.matches;

create trigger enforce_one_active_match_per_player
before insert or update of status, challenger_id, opponent_id on public.matches
for each row
execute function public.enforce_one_active_match_per_player();

create or replace function public.enforce_no_overlapping_scheduled_matches()
returns trigger
language plpgsql
as $$
declare
  new_match_start timestamptz;
  new_match_end timestamptz;
begin
  if new.status <> 'scheduled' then
    return new;
  end if;

  if new.proposed_match_at is null then
    raise exception 'Scheduled matches must have a start time.';
  end if;

  new_match_start := new.proposed_match_at;
  new_match_end := coalesce(
    new.scheduled_match_ends_at,
    new.proposed_match_at + interval '90 minutes'
  );

  if exists (
    select 1
    from public.matches existing_match
    where existing_match.status = 'scheduled'
      and (tg_op = 'INSERT' or existing_match.id <> new.id)
      and existing_match.proposed_match_at is not null
      and (
        existing_match.challenger_id = new.challenger_id
        or existing_match.opponent_id = new.challenger_id
        or existing_match.challenger_id = new.opponent_id
        or existing_match.opponent_id = new.opponent_id
      )
      and tstzrange(
        existing_match.proposed_match_at,
        coalesce(
          existing_match.scheduled_match_ends_at,
          existing_match.proposed_match_at + interval '90 minutes'
        ),
        '[)'
      ) && tstzrange(new_match_start, new_match_end, '[)')
  ) then
    raise exception 'One player already has a match during this time.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_no_overlapping_scheduled_matches on public.matches;

create trigger enforce_no_overlapping_scheduled_matches
before insert or update of status, challenger_id, opponent_id, proposed_match_at, scheduled_match_ends_at on public.matches
for each row
execute function public.enforce_no_overlapping_scheduled_matches();

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'player',
    'pending'
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    role = coalesce(public.profiles.role, 'player'),
    status = coalesce(public.profiles.status, 'pending');

  return new;
end;
$$;

drop trigger if exists create_profile_for_new_user on auth.users;

create trigger create_profile_for_new_user
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.ladder_rankings enable row level security;
alter table public.matches enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;

create policy "Authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check (
  auth.uid() = id
  and role = 'player'
  and status = 'pending'
);

create policy "Users can update their profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Admins can update profiles"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated users can read ladder rankings" on public.ladder_rankings;
drop policy if exists "Users can join ladder" on public.ladder_rankings;
drop policy if exists "Admins can insert ladder rankings" on public.ladder_rankings;
drop policy if exists "Admins can update ladder rankings" on public.ladder_rankings;
drop policy if exists "Admins can delete ladder rankings" on public.ladder_rankings;

create policy "Authenticated users can read ladder rankings"
on public.ladder_rankings
for select
to authenticated
using (true);

create policy "Admins can insert ladder rankings"
on public.ladder_rankings
for insert
to authenticated
with check (public.is_admin());

create policy "Admins can update ladder rankings"
on public.ladder_rankings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete ladder rankings"
on public.ladder_rankings
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Profiles can read their matches" on public.matches;
drop policy if exists "Profiles can create their own challenges" on public.matches;
drop policy if exists "Profiles can update their matches" on public.matches;
drop policy if exists "Admins can read all matches" on public.matches;
drop policy if exists "Admins can update all matches" on public.matches;

create policy "Profiles can read their matches"
on public.matches
for select
to authenticated
using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_admin());

create policy "Profiles can create their own challenges"
on public.matches
for insert
to authenticated
with check (auth.uid() = challenger_id);

create policy "Profiles can update their matches"
on public.matches
for update
to authenticated
using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_admin())
with check (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_admin());

create policy "Admins can read all matches"
on public.matches
for select
to authenticated
using (public.is_admin());

create policy "Admins can update all matches"
on public.matches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
