begin;

-- ============================================================
-- Feature foundation: portal integrations (stage 1)
-- - Feed XML (Grupo OLX)
-- - Webhook lead ingestion with idempotency/audit
-- - Listing/job structures prepared (OLX future)
-- - Allow duplicated phone on leads coming from portals
-- ============================================================

-- ------------------------------------------------------------
-- Helper: updated_at trigger
-- ------------------------------------------------------------
create or replace function public.portal_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Helper: role guard for RLS (admin/gestor active)
-- ------------------------------------------------------------
create or replace function public.portal_is_admin_or_gestor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin', 'gestor')
  );
$$;

grant execute on function public.portal_is_admin_or_gestor() to authenticated;

-- ------------------------------------------------------------
-- Allow duplicate lead phone for portal-origin leads only
-- ------------------------------------------------------------
alter table public.leads
  add column if not exists allow_duplicate_phone boolean not null default false;

drop index if exists leads_phone_e164_unique;
create unique index if not exists leads_phone_e164_unique
  on public.leads (phone_e164)
  where phone_e164 is not null
    and coalesce(allow_duplicate_phone, false) = false;

-- ------------------------------------------------------------
-- Integrations settings table
-- ------------------------------------------------------------
create table if not exists public.portal_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique
    check (provider in ('grupoolx', 'olx', 'meta')),
  is_enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_portal_integrations_updated_at
  on public.portal_integrations;

create trigger trg_portal_integrations_updated_at
before update on public.portal_integrations
for each row execute function public.portal_set_updated_at();

insert into public.portal_integrations (provider, is_enabled, settings)
values
  ('grupoolx', false, '{"label":"Grupo OLX (ZAP/VivaReal)","channel":"feed+xml+webhook"}'::jsonb),
  ('olx', false, '{"label":"OLX","channel":"api+webhook"}'::jsonb),
  ('meta', false, '{"label":"Meta (futuro)","channel":"webhook"}'::jsonb)
on conflict (provider) do nothing;

-- ------------------------------------------------------------
-- Raw webhook event logs (audit + idempotency)
-- ------------------------------------------------------------
create table if not exists public.portal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('grupoolx', 'olx', 'meta')),
  external_event_id text null,
  idempotency_key text not null,
  event_type text null,
  payload jsonb not null,
  headers jsonb null,
  status text not null default 'received'
    check (status in ('received', 'duplicate', 'processed', 'ignored', 'error')),
  error_message text null,
  processing_result jsonb null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null
);

create unique index if not exists portal_webhook_events_idempotency_uidx
  on public.portal_webhook_events (idempotency_key);

create unique index if not exists portal_webhook_events_provider_external_event_uidx
  on public.portal_webhook_events (provider, external_event_id)
  where external_event_id is not null;

create index if not exists portal_webhook_events_provider_received_idx
  on public.portal_webhook_events (provider, received_at desc);

create index if not exists portal_webhook_events_status_received_idx
  on public.portal_webhook_events (status, received_at desc);

-- ------------------------------------------------------------
-- Link external lead references to internal lead/person/property
-- ------------------------------------------------------------
create table if not exists public.portal_lead_links (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('grupoolx', 'olx', 'meta')),
  external_lead_id text null,
  external_conversation_id text null,
  lead_fingerprint text null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  property_id uuid null references public.properties(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists portal_lead_links_provider_external_lead_uidx
  on public.portal_lead_links (provider, external_lead_id)
  where external_lead_id is not null;

create unique index if not exists portal_lead_links_provider_fingerprint_uidx
  on public.portal_lead_links (provider, lead_fingerprint)
  where lead_fingerprint is not null;

create index if not exists portal_lead_links_lead_idx
  on public.portal_lead_links (lead_id, created_at desc);

create index if not exists portal_lead_links_property_idx
  on public.portal_lead_links (property_id, created_at desc);

-- ------------------------------------------------------------
-- Property listings by portal (state mirror)
-- ------------------------------------------------------------
create table if not exists public.property_portal_listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  provider text not null
    check (provider in ('grupoolx', 'olx', 'meta')),
  external_listing_id text null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'queued', 'published', 'paused', 'unpublished', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists property_portal_listings_property_provider_uidx
  on public.property_portal_listings (property_id, provider);

create unique index if not exists property_portal_listings_provider_external_uidx
  on public.property_portal_listings (provider, external_listing_id)
  where external_listing_id is not null;

create index if not exists property_portal_listings_provider_status_idx
  on public.property_portal_listings (provider, status, updated_at desc);

drop trigger if exists trg_property_portal_listings_updated_at
  on public.property_portal_listings;

create trigger trg_property_portal_listings_updated_at
before update on public.property_portal_listings
for each row execute function public.portal_set_updated_at();

-- ------------------------------------------------------------
-- Publish jobs queue (prepared for OLX API flow)
-- ------------------------------------------------------------
create table if not exists public.portal_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  provider text not null
    check (provider in ('grupoolx', 'olx', 'meta')),
  action text not null
    check (action in ('publish', 'update', 'unpublish')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'error', 'cancelled')),
  attempts integer not null default 0,
  next_retry_at timestamptz null,
  last_error text null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb null,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_publish_jobs_status_retry_idx
  on public.portal_publish_jobs (status, next_retry_at nulls first, created_at);

create index if not exists portal_publish_jobs_property_provider_idx
  on public.portal_publish_jobs (property_id, provider, created_at desc);

drop trigger if exists trg_portal_publish_jobs_updated_at
  on public.portal_publish_jobs;

create trigger trg_portal_publish_jobs_updated_at
before update on public.portal_publish_jobs
for each row execute function public.portal_set_updated_at();

-- ------------------------------------------------------------
-- Lead source catalog seeds
-- ------------------------------------------------------------
insert into public.lead_sources (name, position, is_active)
values
  ('Portal - Grupo OLX', 600, true),
  ('Portal - OLX', 601, true),
  ('Portal - Meta', 602, true)
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- RLS + policies (manager-only visibility for integrations/logs)
-- ------------------------------------------------------------
alter table public.portal_integrations enable row level security;
alter table public.portal_webhook_events enable row level security;
alter table public.portal_lead_links enable row level security;
alter table public.property_portal_listings enable row level security;
alter table public.portal_publish_jobs enable row level security;

drop policy if exists portal_integrations_manager_all on public.portal_integrations;
create policy portal_integrations_manager_all
on public.portal_integrations
for all
to authenticated
using (public.portal_is_admin_or_gestor())
with check (public.portal_is_admin_or_gestor());

drop policy if exists portal_webhook_events_manager_all on public.portal_webhook_events;
create policy portal_webhook_events_manager_all
on public.portal_webhook_events
for all
to authenticated
using (public.portal_is_admin_or_gestor())
with check (public.portal_is_admin_or_gestor());

drop policy if exists portal_lead_links_manager_all on public.portal_lead_links;
create policy portal_lead_links_manager_all
on public.portal_lead_links
for all
to authenticated
using (public.portal_is_admin_or_gestor())
with check (public.portal_is_admin_or_gestor());

drop policy if exists property_portal_listings_manager_all on public.property_portal_listings;
create policy property_portal_listings_manager_all
on public.property_portal_listings
for all
to authenticated
using (public.portal_is_admin_or_gestor())
with check (public.portal_is_admin_or_gestor());

drop policy if exists portal_publish_jobs_manager_all on public.portal_publish_jobs;
create policy portal_publish_jobs_manager_all
on public.portal_publish_jobs
for all
to authenticated
using (public.portal_is_admin_or_gestor())
with check (public.portal_is_admin_or_gestor());

grant select, insert, update, delete on public.portal_integrations to authenticated;
grant select, insert, update, delete on public.portal_webhook_events to authenticated;
grant select, insert, update, delete on public.portal_lead_links to authenticated;
grant select, insert, update, delete on public.property_portal_listings to authenticated;
grant select, insert, update, delete on public.portal_publish_jobs to authenticated;

comment on table public.portal_integrations is 'Settings and enable/disable flags for each external portal.';
comment on table public.portal_webhook_events is 'Raw webhook event log with idempotency and processing status.';
comment on table public.portal_lead_links is 'Mapping between portal lead identifiers and internal leads.';
comment on table public.property_portal_listings is 'Portal publishing status mirror per property/provider.';
comment on table public.portal_publish_jobs is 'Queue for publish/update/unpublish operations per portal.';

commit;
