begin;

-- ============================================================
-- Company Settings: admin-only access helper
-- ============================================================
create or replace function public.docs_is_admin_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role = 'admin'
  );
$$;

grant execute on function public.docs_is_admin_active() to authenticated;

-- ============================================================
-- Properties: rent/sale financial fields + forum
-- ============================================================
alter table if exists public.properties
  add column if not exists sale_commission_percent numeric(5,2) null;

alter table if exists public.properties
  add column if not exists rent_commission_percent numeric(5,2) null;

alter table if exists public.properties
  add column if not exists rent_first_month_fee_enabled boolean not null default false;

alter table if exists public.properties
  add column if not exists rent_first_month_fee_percent numeric(5,2) null;

alter table if exists public.properties
  add column if not exists rent_admin_fee_enabled boolean not null default false;

alter table if exists public.properties
  add column if not exists rent_admin_fee_percent numeric(5,2) null;

alter table if exists public.properties
  add column if not exists contract_forum_city text null;

alter table if exists public.properties
  add column if not exists contract_forum_state text null;

-- Backfill sale_commission_percent from legacy commission_percent
do $$
begin
  if to_regclass('public.properties') is not null then
    update public.properties p
       set sale_commission_percent = round(p.commission_percent::numeric, 2)
     where p.sale_commission_percent is null
       and p.commission_percent is not null;
  end if;
end $$;

-- Backfill rent_commission_percent from property_commission_settings
do $$
begin
  if to_regclass('public.property_commission_settings') is not null then
    update public.properties p
       set rent_commission_percent = round(pcs.rent_initial_commission_percent::numeric, 2)
      from public.property_commission_settings pcs
     where p.id = pcs.property_id
       and p.rent_commission_percent is null
       and pcs.rent_initial_commission_percent is not null;
  end if;
end $$;

-- Backfill forum defaults from company_settings singleton (if available)
do $$
declare
  v_forum_city text;
  v_forum_state text;
begin
  if to_regclass('public.company_settings') is null then
    return;
  end if;

  select cs.default_forum_city, cs.default_forum_state
    into v_forum_city, v_forum_state
  from public.company_settings cs
  order by cs.created_at asc
  limit 1;

  if coalesce(v_forum_city, '') <> '' then
    update public.properties
       set contract_forum_city = v_forum_city
     where contract_forum_city is null or btrim(contract_forum_city) = '';
  end if;

  if coalesce(v_forum_state, '') <> '' then
    update public.properties
       set contract_forum_state = upper(v_forum_state)
     where contract_forum_state is null or btrim(contract_forum_state) = '';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_sale_commission_percent_chk'
  ) then
    alter table public.properties
      add constraint properties_sale_commission_percent_chk
      check (sale_commission_percent is null or (sale_commission_percent >= 0 and sale_commission_percent <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_rent_commission_percent_chk'
  ) then
    alter table public.properties
      add constraint properties_rent_commission_percent_chk
      check (rent_commission_percent is null or (rent_commission_percent >= 0 and rent_commission_percent <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_rent_first_month_fee_percent_chk'
  ) then
    alter table public.properties
      add constraint properties_rent_first_month_fee_percent_chk
      check (
        rent_first_month_fee_percent is null
        or (rent_first_month_fee_percent >= 0 and rent_first_month_fee_percent <= 100)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_rent_admin_fee_percent_chk'
  ) then
    alter table public.properties
      add constraint properties_rent_admin_fee_percent_chk
      check (rent_admin_fee_percent is null or (rent_admin_fee_percent >= 0 and rent_admin_fee_percent <= 100));
  end if;
end $$;

-- ============================================================
-- Company Settings RLS: admin-only
-- ============================================================
do $$
begin
  if to_regclass('public.company_settings') is null then
    return;
  end if;

  execute 'alter table public.company_settings enable row level security';

  execute 'drop policy if exists company_settings_select_manager on public.company_settings';
  execute 'drop policy if exists company_settings_insert_manager on public.company_settings';
  execute 'drop policy if exists company_settings_update_manager on public.company_settings';
  execute 'drop policy if exists company_settings_delete_manager on public.company_settings';

  execute 'drop policy if exists company_settings_select_admin on public.company_settings';
  execute 'drop policy if exists company_settings_insert_admin on public.company_settings';
  execute 'drop policy if exists company_settings_update_admin on public.company_settings';
  execute 'drop policy if exists company_settings_delete_admin on public.company_settings';

  execute '
    create policy company_settings_select_admin
    on public.company_settings
    for select
    to authenticated
    using (public.docs_is_admin_active())
  ';

  execute '
    create policy company_settings_insert_admin
    on public.company_settings
    for insert
    to authenticated
    with check (public.docs_is_admin_active())
  ';

  execute '
    create policy company_settings_update_admin
    on public.company_settings
    for update
    to authenticated
    using (public.docs_is_admin_active())
    with check (public.docs_is_admin_active())
  ';

  execute '
    create policy company_settings_delete_admin
    on public.company_settings
    for delete
    to authenticated
    using (public.docs_is_admin_active())
  ';
end $$;

commit;
