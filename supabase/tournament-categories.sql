-- Tournament category settings for the Roton Point Tournament Portal.
-- This creates editable categories only; it does not create draws, matches, or advancement logic.

create table if not exists public.tournament_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null check (event_type in ('singles', 'doubles')),
  draw_size integer not null check (draw_size in (8, 16, 32)),
  is_published boolean not null default false,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

grant execute on function public.is_admin(uuid) to authenticated;

create unique index if not exists tournament_categories_display_order_key
on public.tournament_categories (display_order);

create unique index if not exists tournament_categories_name_key
on public.tournament_categories (name);

create or replace function public.set_tournament_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_tournament_categories_updated_at on public.tournament_categories;

create trigger set_tournament_categories_updated_at
before update on public.tournament_categories
for each row
execute function public.set_tournament_categories_updated_at();

insert into public.tournament_categories (name, event_type, draw_size, is_published, display_order)
select seed.name, seed.event_type, seed.draw_size, false, seed.display_order
from (
  values
    ('Men''s Singles', 'singles', 16, 1),
    ('Men''s Doubles', 'doubles', 16, 2),
    ('Ladies Singles', 'singles', 16, 3),
    ('Ladies Doubles', 'doubles', 16, 4),
    ('Mixed Doubles', 'doubles', 16, 5),
    ('Senior Men''s Singles', 'singles', 8, 6),
    ('Senior Men''s Doubles', 'doubles', 8, 7),
    ('Century Doubles', 'doubles', 8, 8)
) as seed(name, event_type, draw_size, display_order)
on conflict do nothing;

alter table public.tournament_categories enable row level security;

drop policy if exists "Authenticated users can read tournament categories" on public.tournament_categories;
drop policy if exists "Admins can insert tournament categories" on public.tournament_categories;
drop policy if exists "Admins can update tournament categories" on public.tournament_categories;

create policy "Authenticated users can read tournament categories"
on public.tournament_categories
for select
to authenticated
using (true);

create policy "Admins can insert tournament categories"
on public.tournament_categories
for insert
to authenticated
with check (public.is_admin(auth.uid()));

create policy "Admins can update tournament categories"
on public.tournament_categories
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select on public.tournament_categories to authenticated;
grant insert, update on public.tournament_categories to authenticated;
revoke delete on public.tournament_categories from authenticated;

create table if not exists public.tournament_draw_slots (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  round_number integer not null,
  round_name text not null,
  match_number integer not null,
  slot_number integer not null check (slot_number in (1, 2)),
  participant_name text,
  is_winner boolean not null default false,
  score text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tournament_draw_slots_slot_key
on public.tournament_draw_slots (category_id, round_number, match_number, slot_number);

create index if not exists tournament_draw_slots_category_round_idx
on public.tournament_draw_slots (category_id, round_number, match_number);

create table if not exists public.tournament_round_settings (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  round_number integer not null,
  round_name text not null,
  deadline_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, round_number)
);

create or replace function public.set_tournament_draw_slots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_tournament_draw_slots_updated_at on public.tournament_draw_slots;

create trigger set_tournament_draw_slots_updated_at
before update on public.tournament_draw_slots
for each row
execute function public.set_tournament_draw_slots_updated_at();

create or replace function public.set_tournament_round_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_tournament_round_settings_updated_at on public.tournament_round_settings;

create trigger set_tournament_round_settings_updated_at
before update on public.tournament_round_settings
for each row
execute function public.set_tournament_round_settings_updated_at();

alter table public.tournament_draw_slots enable row level security;
alter table public.tournament_round_settings enable row level security;

drop policy if exists "Authenticated users can read tournament draw slots" on public.tournament_draw_slots;
drop policy if exists "Admins can insert tournament draw slots" on public.tournament_draw_slots;
drop policy if exists "Admins can update tournament draw slots" on public.tournament_draw_slots;
drop policy if exists "Admins can delete tournament draw slots" on public.tournament_draw_slots;

create policy "Authenticated users can read tournament draw slots"
on public.tournament_draw_slots
for select
to authenticated
using (true);

create policy "Admins can insert tournament draw slots"
on public.tournament_draw_slots
for insert
to authenticated
with check (public.is_admin(auth.uid()));

create policy "Admins can update tournament draw slots"
on public.tournament_draw_slots
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "Admins can delete tournament draw slots"
on public.tournament_draw_slots
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Authenticated users can read tournament round settings" on public.tournament_round_settings;
drop policy if exists "Admins can insert tournament round settings" on public.tournament_round_settings;
drop policy if exists "Admins can update tournament round settings" on public.tournament_round_settings;
drop policy if exists "Admins can delete tournament round settings" on public.tournament_round_settings;

create policy "Authenticated users can read tournament round settings"
on public.tournament_round_settings
for select
to authenticated
using (true);

create policy "Admins can insert tournament round settings"
on public.tournament_round_settings
for insert
to authenticated
with check (public.is_admin(auth.uid()));

create policy "Admins can update tournament round settings"
on public.tournament_round_settings
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "Admins can delete tournament round settings"
on public.tournament_round_settings
for delete
to authenticated
using (public.is_admin(auth.uid()));

grant select on public.tournament_draw_slots to authenticated;
grant insert, update, delete on public.tournament_draw_slots to authenticated;
grant select on public.tournament_round_settings to authenticated;
grant insert, update, delete on public.tournament_round_settings to authenticated;

notify pgrst, 'reload schema';
