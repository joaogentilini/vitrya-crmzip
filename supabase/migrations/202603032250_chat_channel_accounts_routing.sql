begin;

-- ============================================================
-- Fase 3 / Sprint 2 - Roteamento de ownership por conta/canal
-- ============================================================

create table if not exists public.chat_channel_accounts (
  id uuid primary key default gen_random_uuid(),
  channel text not null
    check (channel in ('whatsapp', 'instagram', 'facebook', 'olx', 'grupoolx', 'meta', 'other')),
  provider_account_id text not null,
  account_name text null,
  broker_user_id uuid null references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_channel_accounts_channel_provider_uidx
  on public.chat_channel_accounts (channel, provider_account_id);

create index if not exists chat_channel_accounts_broker_active_updated_idx
  on public.chat_channel_accounts (broker_user_id, is_active, updated_at desc);

drop trigger if exists trg_chat_channel_accounts_updated_at on public.chat_channel_accounts;
create trigger trg_chat_channel_accounts_updated_at
before update on public.chat_channel_accounts
for each row execute function public.chat_set_updated_at();

alter table public.chat_channel_accounts enable row level security;

drop policy if exists chat_channel_accounts_select on public.chat_channel_accounts;
create policy chat_channel_accounts_select
on public.chat_channel_accounts
for select
to authenticated
using (
  broker_user_id = auth.uid()
  or public.chat_is_admin_or_gestor()
);

drop policy if exists chat_channel_accounts_insert on public.chat_channel_accounts;
create policy chat_channel_accounts_insert
on public.chat_channel_accounts
for insert
to authenticated
with check (public.chat_is_admin_or_gestor());

drop policy if exists chat_channel_accounts_update on public.chat_channel_accounts;
create policy chat_channel_accounts_update
on public.chat_channel_accounts
for update
to authenticated
using (public.chat_is_admin_or_gestor())
with check (public.chat_is_admin_or_gestor());

drop policy if exists chat_channel_accounts_delete on public.chat_channel_accounts;
create policy chat_channel_accounts_delete
on public.chat_channel_accounts
for delete
to authenticated
using (public.chat_is_admin_or_gestor());

grant select, insert, update, delete on public.chat_channel_accounts to authenticated;

comment on table public.chat_channel_accounts is 'Mapeia contas externas por canal para ownership de conversas no inbox.';
comment on column public.chat_channel_accounts.provider_account_id is 'ID da conta no provedor (page_id, instagram_business_id, phone_number_id etc).';
comment on column public.chat_channel_accounts.settings is 'Metadados de integracao da conta (JSON).';

commit;
