-- SQL changes needed for the challenge workflow.
-- This uses your existing tables:
--   public.profiles
--   public.ladder_rankings
--   public.matches
--   public.courts
--
-- Assumptions:
--   profiles.id is the authenticated user's UUID.
--   profiles has a full_name display column.
--   ladder_rankings.player_id references profiles.id / auth.users.id.
--   ladder_rankings.rank_position stores the ladder position.
--   matches stores challenger/opponent profile IDs.

alter table public.profiles
add column if not exists full_name text,
add column if not exists email text,
add column if not exists status text not null default 'approved',
add column if not exists role text not null default 'player';

alter table public.profiles
drop constraint if exists profiles_status_check;

alter table public.profiles
add constraint profiles_status_check
check (status in ('pending', 'approved'));

alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('player', 'admin'));

update public.profiles
set status = 'approved'
where status is null;

alter table public.profiles
alter column status set default 'pending';

alter table public.matches
add column if not exists challenger_id uuid references public.profiles(id) on delete cascade,
add column if not exists opponent_id uuid references public.profiles(id) on delete cascade,
add column if not exists status text not null default 'pending',
add column if not exists proposed_match_at timestamptz,
add column if not exists proposed_match_options jsonb not null default '[]'::jsonb,
add column if not exists scheduled_match_ends_at timestamptz,
add column if not exists proposed_by_player_id uuid references public.profiles(id) on delete set null,
add column if not exists challenger_agreed_at timestamptz,
add column if not exists opponent_agreed_at timestamptz,
add column if not exists cancel_reason text,
add column if not exists canceled_at timestamptz,
add column if not exists canceled_by uuid references public.profiles(id) on delete set null,
add column if not exists winner_id uuid references public.profiles(id) on delete set null,
add column if not exists score text,
add column if not exists stats_recorded boolean not null default false,
add column if not exists ranking_updated boolean not null default false,
add column if not exists created_at timestamptz not null default now();

alter table public.matches
drop constraint if exists matches_status_check;

alter table public.matches
add constraint matches_status_check
check (status in ('pending', 'accepted', 'time_proposed', 'declined', 'scheduled', 'completed', 'canceled', 'expired'));

alter table public.matches
drop constraint if exists matches_distinct_players_check;

alter table public.matches
add constraint matches_distinct_players_check
check (challenger_id <> opponent_id);

create unique index if not exists one_active_match_per_profile_pair
on public.matches (
  least(challenger_id, opponent_id),
  greatest(challenger_id, opponent_id)
)
where status in ('pending', 'accepted', 'time_proposed', 'scheduled');

-- Force-refresh challenge validation. If an older installed function referenced
-- ladder_rankings.rank, dropping it first removes that stale function body.
do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select trigger_name
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'matches'
      and (
        trigger_name ilike '%challenge%'
        or trigger_name ilike '%rank%'
      )
  loop
    execute format(
      'drop trigger if exists %I on public.matches',
      trigger_record.trigger_name
    );
  end loop;
end;
$$;

drop trigger if exists enforce_challenge_rank_limit on public.matches;
drop trigger if exists validate_challenge_rank_limit on public.matches;
drop trigger if exists check_challenge_rank_limit on public.matches;

drop function if exists public.enforce_challenge_rank_limit();
drop function if exists public.validate_challenge_rank_limit();
drop function if exists public.check_challenge_rank_limit();

create or replace function public.enforce_challenge_rank_limit()
returns trigger
language plpgsql
as $$
declare
  challenger_rank integer;
  opponent_rank integer;
begin
  select rank_position into challenger_rank
  from public.ladder_rankings
  where player_id = new.challenger_id;

  select rank_position into opponent_rank
  from public.ladder_rankings
  where player_id = new.opponent_id;

  if challenger_rank is null or opponent_rank is null then
    raise exception 'Both challenger and opponent must have ladder rankings.';
  end if;

  if challenger_rank = 1 then
    raise exception 'Rank 1 cannot challenge anyone.';
  end if;

  if opponent_rank >= challenger_rank or opponent_rank < challenger_rank - 3 then
    raise exception 'Players can only challenge opponents ranked up to 3 spots above them.';
  end if;

  return new;
end;
$$;

create trigger enforce_challenge_rank_limit
before insert on public.matches
for each row
execute function public.enforce_challenge_rank_limit();

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

alter table public.profiles enable row level security;
alter table public.ladder_rankings enable row level security;
alter table public.matches enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Authenticated users can read ladder rankings" on public.ladder_rankings;
drop policy if exists "Profiles can read their matches" on public.matches;
drop policy if exists "Profiles can create their own challenges" on public.matches;
drop policy if exists "Profiles can update their matches" on public.matches;

create policy "Authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Authenticated users can read ladder rankings"
on public.ladder_rankings
for select
to authenticated
using (true);

create policy "Profiles can read their matches"
on public.matches
for select
to authenticated
using (auth.uid() = challenger_id or auth.uid() = opponent_id);

create policy "Profiles can create their own challenges"
on public.matches
for insert
to authenticated
with check (auth.uid() = challenger_id);

create policy "Profiles can update their matches"
on public.matches
for update
to authenticated
using (auth.uid() = challenger_id or auth.uid() = opponent_id)
with check (auth.uid() = challenger_id or auth.uid() = opponent_id);
