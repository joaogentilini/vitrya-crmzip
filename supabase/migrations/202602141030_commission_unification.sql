begin;

-- ============================================================
-- 1) Configuracao de comissao por imovel (venda + locacao)
-- ============================================================
create table if not exists public.property_commission_settings (
  property_id uuid primary key references public.properties(id) on delete cascade,
  sale_commission_percent numeric(7,4) not null default 5,
  sale_broker_split_percent numeric(7,4) not null default 50,
  sale_partner_split_percent numeric(7,4) not null default 0,
  rent_initial_commission_percent numeric(7,4) not null default 10,
  rent_recurring_commission_percent numeric(7,4) not null default 8,
  rent_broker_split_percent numeric(7,4) not null default 50,
  rent_partner_split_percent numeric(7,4) not null default 0,
  updated_by_profile_id uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_commission_settings_updated_at_idx
  on public.property_commission_settings(updated_at desc);

create or replace function public.property_commission_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_property_commission_settings_updated_at
  on public.property_commission_settings;

create trigger trg_property_commission_settings_updated_at
before update on public.property_commission_settings
for each row execute function public.property_commission_settings_set_updated_at();

alter table public.property_commission_settings enable row level security;

drop policy if exists property_commission_settings_select on public.property_commission_settings;
drop policy if exists property_commission_settings_insert on public.property_commission_settings;
drop policy if exists property_commission_settings_update on public.property_commission_settings;
drop policy if exists property_commission_settings_delete on public.property_commission_settings;

create policy property_commission_settings_select
on public.property_commission_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_commission_settings.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
);

create policy property_commission_settings_insert
on public.property_commission_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.properties p
    where p.id = property_commission_settings.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
);

create policy property_commission_settings_update
on public.property_commission_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_commission_settings.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
)
with check (
  exists (
    select 1
    from public.properties p
    where p.id = property_commission_settings.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
);

create policy property_commission_settings_delete
on public.property_commission_settings
for delete
to authenticated
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_commission_settings.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
);

do $$
declare
  has_commission_percent boolean := false;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'properties'
      and column_name = 'commission_percent'
  ) into has_commission_percent;

  if has_commission_percent then
    insert into public.property_commission_settings (property_id, sale_commission_percent)
    select p.id, coalesce(p.commission_percent, 5)
    from public.properties p
    on conflict (property_id) do nothing;
  else
    insert into public.property_commission_settings (property_id)
    select p.id
    from public.properties p
    on conflict (property_id) do nothing;
  end if;
end
$$;

-- ============================================================
-- 2) Snapshot financeiro de proposta (evita duplicidade)
-- ============================================================
alter table public.property_proposals
  add column if not exists base_value numeric(14,2),
  add column if not exists owner_net_value numeric(14,2),
  add column if not exists broker_split_percent numeric(7,4),
  add column if not exists broker_commission_value numeric(14,2),
  add column if not exists partner_split_percent numeric(7,4),
  add column if not exists partner_commission_value numeric(14,2),
  add column if not exists company_commission_value numeric(14,2),
  add column if not exists commission_modality text;

-- ============================================================
-- 3) Pagamentos de comissao por corretor (ledger financeiro)
-- ============================================================
create table if not exists public.broker_commission_payments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.property_proposals(id) on delete cascade,
  broker_profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null,
  status text not null default 'pending',
  expected_at date null,
  received_at date null,
  notes text null,
  created_by_profile_id uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broker_commission_payments_broker_idx
  on public.broker_commission_payments(broker_profile_id, status, expected_at, received_at);

create index if not exists broker_commission_payments_proposal_idx
  on public.broker_commission_payments(proposal_id);

create or replace function public.broker_commission_payments_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_broker_commission_payments_updated_at
  on public.broker_commission_payments;

create trigger trg_broker_commission_payments_updated_at
before update on public.broker_commission_payments
for each row execute function public.broker_commission_payments_set_updated_at();

alter table public.broker_commission_payments enable row level security;

drop policy if exists broker_commission_payments_select on public.broker_commission_payments;
drop policy if exists broker_commission_payments_insert on public.broker_commission_payments;
drop policy if exists broker_commission_payments_update on public.broker_commission_payments;
drop policy if exists broker_commission_payments_delete on public.broker_commission_payments;

create policy broker_commission_payments_select
on public.broker_commission_payments
for select
to authenticated
using (
  broker_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.property_proposals pp
    join public.properties p on p.id = pp.property_id
    where pp.id = broker_commission_payments.proposal_id
      and p.owner_user_id = auth.uid()
  )
);

create policy broker_commission_payments_insert
on public.broker_commission_payments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
);

create policy broker_commission_payments_update
on public.broker_commission_payments
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
)
with check (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
);

create policy broker_commission_payments_delete
on public.broker_commission_payments
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
);

-- ============================================================
-- 4) Documentos: contrato de gestao com snapshot de comissao
-- ============================================================
do $$
begin
  if to_regclass('public.property_documents') is not null then
    alter table public.property_documents
      add column if not exists commission_snapshot jsonb;

    alter table public.property_documents
      drop constraint if exists property_documents_doc_type_check;

    alter table public.property_documents
      add constraint property_documents_doc_type_check
      check (doc_type in ('authorization', 'management_contract', 'other'));
  end if;
end
$$;

commit;
