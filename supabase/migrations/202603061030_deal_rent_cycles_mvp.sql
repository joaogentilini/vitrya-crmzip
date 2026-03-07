begin;

-- ============================================================
-- Phase 7 (ERP) - Locacao MVP financeiro
-- Ciclo mensal de aluguel por deal confirmado (operation_type=rent)
-- ============================================================

-- Ensure helper exists in environments without prior finance migrations.
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

create table if not exists public.deal_rent_cycles (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  broker_user_id uuid null references public.profiles(id) on delete set null,
  owner_person_id uuid null references public.people(id) on delete set null,
  business_line_id uuid null references public.business_lines(id) on delete set null,
  competence_month date not null,
  due_date date not null,
  rent_amount numeric(14,2) not null default 0,
  commission_total numeric(14,2) not null default 0,
  broker_commission numeric(14,2) not null default 0,
  partner_commission numeric(14,2) not null default 0,
  company_commission numeric(14,2) not null default 0,
  owner_net_amount numeric(14,2) not null default 0,
  status text not null default 'open',
  receivable_id uuid null references public.receivables(id) on delete set null,
  owner_payable_id uuid null references public.payables(id) on delete set null,
  broker_payable_id uuid null references public.payables(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deal_rent_cycles
  add column if not exists deal_id uuid references public.deals(id) on delete cascade,
  add column if not exists property_id uuid references public.properties(id) on delete restrict,
  add column if not exists broker_user_id uuid null references public.profiles(id) on delete set null,
  add column if not exists owner_person_id uuid null references public.people(id) on delete set null,
  add column if not exists business_line_id uuid null references public.business_lines(id) on delete set null,
  add column if not exists competence_month date,
  add column if not exists due_date date,
  add column if not exists rent_amount numeric(14,2) not null default 0,
  add column if not exists commission_total numeric(14,2) not null default 0,
  add column if not exists broker_commission numeric(14,2) not null default 0,
  add column if not exists partner_commission numeric(14,2) not null default 0,
  add column if not exists company_commission numeric(14,2) not null default 0,
  add column if not exists owner_net_amount numeric(14,2) not null default 0,
  add column if not exists status text not null default 'open',
  add column if not exists receivable_id uuid null references public.receivables(id) on delete set null,
  add column if not exists owner_payable_id uuid null references public.payables(id) on delete set null,
  add column if not exists broker_payable_id uuid null references public.payables(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid null references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.deal_rent_cycles
set status = 'open'
where status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deal_rent_cycles_status_check'
      and conrelid = 'public.deal_rent_cycles'::regclass
  ) then
    alter table public.deal_rent_cycles
      add constraint deal_rent_cycles_status_check
      check (status in ('open', 'received', 'owner_paid', 'cancelled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deal_rent_cycles_competence_month_check'
      and conrelid = 'public.deal_rent_cycles'::regclass
  ) then
    alter table public.deal_rent_cycles
      add constraint deal_rent_cycles_competence_month_check
      check (date_trunc('month', competence_month) = competence_month);
  end if;
end $$;

create unique index if not exists deal_rent_cycles_deal_month_uidx
  on public.deal_rent_cycles(deal_id, competence_month);

create index if not exists deal_rent_cycles_broker_month_idx
  on public.deal_rent_cycles(broker_user_id, competence_month desc, created_at desc);

create index if not exists deal_rent_cycles_status_month_idx
  on public.deal_rent_cycles(status, competence_month desc, created_at desc);

drop trigger if exists trg_deal_rent_cycles_set_updated_at on public.deal_rent_cycles;
create trigger trg_deal_rent_cycles_set_updated_at
before update on public.deal_rent_cycles
for each row
execute function public.set_updated_at();

alter table public.deal_rent_cycles enable row level security;

drop policy if exists deal_rent_cycles_select_policy on public.deal_rent_cycles;
create policy deal_rent_cycles_select_policy
on public.deal_rent_cycles
for select
to authenticated
using (
  public.fin_is_admin_or_gestor_active()
  or broker_user_id = auth.uid()
);

drop policy if exists deal_rent_cycles_insert_policy on public.deal_rent_cycles;
create policy deal_rent_cycles_insert_policy
on public.deal_rent_cycles
for insert
to authenticated
with check (public.fin_is_admin_or_gestor_active());

drop policy if exists deal_rent_cycles_update_policy on public.deal_rent_cycles;
create policy deal_rent_cycles_update_policy
on public.deal_rent_cycles
for update
to authenticated
using (public.fin_is_admin_or_gestor_active())
with check (public.fin_is_admin_or_gestor_active());

drop policy if exists deal_rent_cycles_delete_policy on public.deal_rent_cycles;
create policy deal_rent_cycles_delete_policy
on public.deal_rent_cycles
for delete
to authenticated
using (public.fin_is_admin_or_gestor_active());

grant select, insert, update, delete on public.deal_rent_cycles to authenticated;

comment on table public.deal_rent_cycles is 'Ciclo mensal de locacao por deal confirmado com trilha de recebimento e repasse.';

commit;
