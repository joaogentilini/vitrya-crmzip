begin;

-- Sprint B: deal financial snapshot + commission lifecycle integration

-- Ensure finance role helper exists for environments that did not apply Stage 0 yet.
do $$
begin
  if to_regprocedure('public.fin_is_admin_or_gestor_active()') is null then
    execute $fn$
      create function public.fin_is_admin_or_gestor_active()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.is_active = true
            and p.role in ('admin', 'gestor')
        );
      $body$;
    $fn$;
  end if;
end $$;

grant execute on function public.fin_is_admin_or_gestor_active() to authenticated;

-- Reuse updated_at helper if already present.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    execute $fn$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      as $body$
      begin
        new.updated_at := now();
        return new;
      end;
      $body$;
    $fn$;
  end if;
end $$;

create table if not exists public.deal_commission_snapshots (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  negotiation_id uuid null references public.property_negotiations(id) on delete set null,
  broker_user_id uuid null references public.profiles(id) on delete set null,
  gross_value numeric(14,2) not null default 0,
  total_commission_value numeric(14,2) not null default 0,
  broker_commission_value numeric(14,2) not null default 0,
  company_commission_value numeric(14,2) not null default 0,
  partner_commission_value numeric(14,2) null default 0,
  currency text not null default 'BRL',
  calc_json jsonb not null default '{}'::jsonb,
  status text not null default 'waiting_receipt',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deal_commission_snapshots
  add column if not exists deal_id uuid references public.deals(id) on delete cascade,
  add column if not exists property_id uuid references public.properties(id) on delete restrict,
  add column if not exists negotiation_id uuid null references public.property_negotiations(id) on delete set null,
  add column if not exists broker_user_id uuid null references public.profiles(id) on delete set null,
  add column if not exists gross_value numeric(14,2) not null default 0,
  add column if not exists total_commission_value numeric(14,2) not null default 0,
  add column if not exists broker_commission_value numeric(14,2) not null default 0,
  add column if not exists company_commission_value numeric(14,2) not null default 0,
  add column if not exists partner_commission_value numeric(14,2) null default 0,
  add column if not exists currency text not null default 'BRL',
  add column if not exists calc_json jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'waiting_receipt',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.deal_commission_snapshots
set currency = 'BRL'
where currency is null;

update public.deal_commission_snapshots
set status = 'waiting_receipt'
where status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deal_commission_snapshots_status_check'
      and conrelid = 'public.deal_commission_snapshots'::regclass
  ) then
    alter table public.deal_commission_snapshots
      add constraint deal_commission_snapshots_status_check
      check (status in ('waiting_receipt', 'payable', 'paid'));
  end if;
end $$;

create unique index if not exists deal_commission_snapshots_deal_unique_idx
  on public.deal_commission_snapshots(deal_id);

create index if not exists deal_commission_snapshots_broker_idx
  on public.deal_commission_snapshots(broker_user_id, status, created_at desc);

create index if not exists deal_commission_snapshots_property_idx
  on public.deal_commission_snapshots(property_id, created_at desc);

drop trigger if exists trg_deal_commission_snapshots_set_updated_at on public.deal_commission_snapshots;
create trigger trg_deal_commission_snapshots_set_updated_at
before update on public.deal_commission_snapshots
for each row
execute function public.set_updated_at();

alter table public.deal_commission_snapshots enable row level security;

drop policy if exists deal_commission_snapshots_select_policy on public.deal_commission_snapshots;
create policy deal_commission_snapshots_select_policy
on public.deal_commission_snapshots
for select
to authenticated
using (
  public.fin_is_admin_or_gestor_active()
  or broker_user_id = auth.uid()
);

drop policy if exists deal_commission_snapshots_insert_policy on public.deal_commission_snapshots;
create policy deal_commission_snapshots_insert_policy
on public.deal_commission_snapshots
for insert
to authenticated
with check (public.fin_is_admin_or_gestor_active());

drop policy if exists deal_commission_snapshots_update_policy on public.deal_commission_snapshots;
create policy deal_commission_snapshots_update_policy
on public.deal_commission_snapshots
for update
to authenticated
using (public.fin_is_admin_or_gestor_active())
with check (public.fin_is_admin_or_gestor_active());

drop policy if exists deal_commission_snapshots_delete_policy on public.deal_commission_snapshots;
create policy deal_commission_snapshots_delete_policy
on public.deal_commission_snapshots
for delete
to authenticated
using (public.fin_is_admin_or_gestor_active());

grant select, insert, update, delete on public.deal_commission_snapshots to authenticated;

-- Extend finance_distributions to support pre-receipt deal splits.
do $$
begin
  if to_regclass('public.finance_distributions') is not null then
    alter table public.finance_distributions
      add column if not exists deal_id uuid null references public.deals(id) on delete cascade,
      add column if not exists receivable_id uuid null references public.receivables(id) on delete set null,
      add column if not exists role text null,
      add column if not exists amount numeric(14,2) null,
      add column if not exists payout_status text not null default 'pending',
      add column if not exists released_at timestamptz null,
      add column if not exists paid_at timestamptz null,
      add column if not exists broker_user_id uuid null references public.profiles(id) on delete set null,
      add column if not exists property_id uuid null references public.properties(id) on delete set null;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_distributions'
        and column_name = 'payment_id'
        and is_nullable = 'NO'
    ) then
      execute 'alter table public.finance_distributions alter column payment_id drop not null';
    end if;

    update public.finance_distributions
    set payout_status = 'pending'
    where payout_status is null;

    alter table public.finance_distributions
      drop constraint if exists finance_distributions_role_check;

    alter table public.finance_distributions
      add constraint finance_distributions_role_check
      check (role is null or role in ('broker', 'company', 'partner'));

    alter table public.finance_distributions
      drop constraint if exists finance_distributions_payout_status_check;

    alter table public.finance_distributions
      add constraint finance_distributions_payout_status_check
      check (payout_status in ('pending', 'released', 'paid', 'reverted', 'failed'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.finance_distributions') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'finance_distributions'
         and indexname = 'finance_distributions_deal_idx'
     ) then
    execute 'create index finance_distributions_deal_idx on public.finance_distributions(deal_id, role, payout_status)';
  end if;

  if to_regclass('public.finance_distributions') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'finance_distributions'
         and indexname = 'finance_distributions_receivable_idx'
     ) then
    execute 'create index finance_distributions_receivable_idx on public.finance_distributions(receivable_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_deal_unique_idx'
     ) then
    execute 'create unique index receivables_deal_unique_idx on public.receivables(origin_id) where origin_type = ''deal'' and origin_id is not null';
  end if;

  if to_regclass('public.finance_distributions') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'finance_distributions'
         and indexname = 'finance_distributions_deal_role_unique_idx'
     ) then
    execute 'create unique index finance_distributions_deal_role_unique_idx on public.finance_distributions(deal_id, role) where deal_id is not null and role is not null';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_origin_deal_idx'
     ) then
    execute 'create index receivables_origin_deal_idx on public.receivables(origin_type, origin_id)';
  end if;
end $$;

commit;
