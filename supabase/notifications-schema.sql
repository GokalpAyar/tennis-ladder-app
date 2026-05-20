-- Notifications support for player and admin updates.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_at_idx
on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
on public.notifications (user_id, is_read)
where is_read = false;

alter table public.notifications enable row level security;

drop policy if exists "Users can read their notifications" on public.notifications;
drop policy if exists "Users can update their notifications" on public.notifications;

create policy "Users can read their notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can update their notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.create_notification(
  target_user_id uuid,
  notification_title text,
  notification_message text,
  notification_type text default 'info'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_id uuid;
begin
  insert into public.notifications (user_id, title, message, type)
  values (target_user_id, notification_title, notification_message, notification_type)
  returning id into notification_id;

  return notification_id;
end;
$$;

grant execute on function public.create_notification(uuid, text, text, text) to authenticated;
