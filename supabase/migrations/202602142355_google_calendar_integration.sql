begin;

create table if not exists public.user_google_calendar_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text null,
  calendar_id text not null default 'primary',
  access_token text not null,
  refresh_token text null,
  token_type text null,
  scope text null,
  expires_at timestamptz null,
  sync_enabled boolean not null default true,
  auto_create_from_tasks boolean not null default true,
  last_error text null,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_calendar_task_events (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  google_event_id text not null,
  calendar_id text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists google_calendar_task_events_user_id_idx
  on public.google_calendar_task_events(user_id);

create index if not exists google_calendar_task_events_event_id_idx
  on public.google_calendar_task_events(google_event_id);

create or replace function public.set_google_calendar_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_google_calendar_integrations_updated_at
  on public.user_google_calendar_integrations;

create trigger trg_user_google_calendar_integrations_updated_at
before update on public.user_google_calendar_integrations
for each row
execute function public.set_google_calendar_updated_at();

drop trigger if exists trg_google_calendar_task_events_updated_at
  on public.google_calendar_task_events;

create trigger trg_google_calendar_task_events_updated_at
before update on public.google_calendar_task_events
for each row
execute function public.set_google_calendar_updated_at();

alter table public.user_google_calendar_integrations enable row level security;
alter table public.google_calendar_task_events enable row level security;

drop policy if exists user_google_calendar_integrations_select_own
  on public.user_google_calendar_integrations;
create policy user_google_calendar_integrations_select_own
on public.user_google_calendar_integrations
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_google_calendar_integrations_insert_own
  on public.user_google_calendar_integrations;
create policy user_google_calendar_integrations_insert_own
on public.user_google_calendar_integrations
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_google_calendar_integrations_update_own
  on public.user_google_calendar_integrations;
create policy user_google_calendar_integrations_update_own
on public.user_google_calendar_integrations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_google_calendar_integrations_delete_own
  on public.user_google_calendar_integrations;
create policy user_google_calendar_integrations_delete_own
on public.user_google_calendar_integrations
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists google_calendar_task_events_select_own
  on public.google_calendar_task_events;
create policy google_calendar_task_events_select_own
on public.google_calendar_task_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists google_calendar_task_events_insert_own
  on public.google_calendar_task_events;
create policy google_calendar_task_events_insert_own
on public.google_calendar_task_events
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists google_calendar_task_events_update_own
  on public.google_calendar_task_events;
create policy google_calendar_task_events_update_own
on public.google_calendar_task_events
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists google_calendar_task_events_delete_own
  on public.google_calendar_task_events;
create policy google_calendar_task_events_delete_own
on public.google_calendar_task_events
for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_google_calendar_integrations to authenticated;
grant select, insert, update, delete on public.google_calendar_task_events to authenticated;

commit;

