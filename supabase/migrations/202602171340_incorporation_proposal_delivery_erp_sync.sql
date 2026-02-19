begin;

alter table public.incorporation_client_proposals
  add column if not exists pdf_storage_path text null,
  add column if not exists pdf_generated_at timestamptz null,
  add column if not exists email_delivery_status text not null default 'pending'
    check (email_delivery_status in ('pending', 'sent', 'skipped', 'error')),
  add column if not exists email_delivered_at timestamptz null,
  add column if not exists whatsapp_delivery_status text not null default 'pending'
    check (whatsapp_delivery_status in ('pending', 'sent', 'skipped', 'error')),
  add column if not exists whatsapp_delivered_at timestamptz null,
  add column if not exists delivery_last_error text null,
  add column if not exists erp_sync_status text not null default 'pending'
    check (erp_sync_status in ('pending', 'synced', 'error')),
  add column if not exists erp_synced_at timestamptz null,
  add column if not exists erp_last_error text null,
  add column if not exists external_reference text null;

create index if not exists incorporation_client_proposals_erp_sync_idx
  on public.incorporation_client_proposals (erp_sync_status, created_at desc);

create index if not exists incorporation_client_proposals_delivery_status_idx
  on public.incorporation_client_proposals (email_delivery_status, whatsapp_delivery_status, created_at desc);

create table if not exists public.incorporation_proposal_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.incorporation_client_proposals(id) on delete cascade,
  incorporation_id uuid not null references public.incorporations(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'erp')),
  status text not null check (status in ('sent', 'skipped', 'error', 'synced')),
  recipient text null,
  payload jsonb null,
  provider_response jsonb null,
  error_message text null,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists incorporation_proposal_delivery_logs_proposal_idx
  on public.incorporation_proposal_delivery_logs (proposal_id, created_at desc);

create index if not exists incorporation_proposal_delivery_logs_channel_idx
  on public.incorporation_proposal_delivery_logs (channel, status, created_at desc);

alter table public.incorporation_proposal_delivery_logs enable row level security;

drop policy if exists incorporation_proposal_delivery_logs_select_own_or_manager on public.incorporation_proposal_delivery_logs;
create policy incorporation_proposal_delivery_logs_select_own_or_manager
on public.incorporation_proposal_delivery_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.incorporation_client_proposals p
    where p.id = incorporation_proposal_delivery_logs.proposal_id
      and (
        p.broker_user_id = auth.uid()
        or public.incorp_is_admin_or_gestor_active()
      )
  )
);

drop policy if exists incorporation_proposal_delivery_logs_insert_internal on public.incorporation_proposal_delivery_logs;
create policy incorporation_proposal_delivery_logs_insert_internal
on public.incorporation_proposal_delivery_logs
for insert
to authenticated
with check (public.incorp_is_internal_active_user());

drop policy if exists incorporation_proposal_delivery_logs_delete_manager on public.incorporation_proposal_delivery_logs;
create policy incorporation_proposal_delivery_logs_delete_manager
on public.incorporation_proposal_delivery_logs
for delete
to authenticated
using (public.incorp_is_admin_or_gestor_active());

comment on table public.incorporation_proposal_delivery_logs is 'Historico de envio da proposta de incorporacao para email, WhatsApp e ERP.';

commit;
