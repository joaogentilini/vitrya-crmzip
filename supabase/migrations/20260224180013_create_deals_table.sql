begin;

-- ============================================================
-- Deals root entity (manual business closure)
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'deal_operation_type'
  ) then
    create type public.deal_operation_type as enum ('sale', 'development', 'rent');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'deal_status'
  ) then
    create type public.deal_status as enum ('draft', 'confirmed', 'cancelled');
  end if;
end $$;

-- Reuse helper if it already exists. Fallback only for environments that do not have it yet.
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    execute $fn$
      create function public.is_admin()
      returns boolean
      language sql
      security definer
      set search_path = public
      stable
      as $body$
        select exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.is_active = true
            and pr.role in ('admin', 'gestor')
        );
      $body$;
    $fn$;
  end if;
end $$;

grant execute on function public.is_admin() to authenticated;

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

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  lead_id uuid null references public.leads(id) on delete set null,
  negotiation_id uuid null references public.property_negotiations(id) on delete set null,
  proposal_id uuid null references public.property_proposals(id) on delete set null,
  operation_type public.deal_operation_type not null,
  status public.deal_status not null default 'draft',
  closed_at timestamptz null,
  gross_value numeric(14,2) null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_owner_user_id_idx on public.deals(owner_user_id);
create index if not exists deals_property_id_idx on public.deals(property_id);
create index if not exists deals_status_idx on public.deals(status);
create index if not exists deals_closed_at_idx on public.deals(closed_at);

create unique index if not exists deals_negotiation_confirmed_unique_idx
  on public.deals(negotiation_id)
  where status = 'confirmed' and negotiation_id is not null;

drop trigger if exists trg_deals_set_updated_at on public.deals;
create trigger trg_deals_set_updated_at
before update on public.deals
for each row
execute function public.set_updated_at();

alter table public.deals enable row level security;

drop policy if exists deals_select_policy on public.deals;
create policy deals_select_policy
on public.deals
for select
to authenticated
using (
  public.is_admin()
  or owner_user_id = auth.uid()
);

drop policy if exists deals_insert_policy on public.deals;
create policy deals_insert_policy
on public.deals
for insert
to authenticated
with check (
  (public.is_admin() or owner_user_id = auth.uid())
  and created_by = auth.uid()
);

drop policy if exists deals_update_policy on public.deals;
create policy deals_update_policy
on public.deals
for update
to authenticated
using (
  public.is_admin()
  or owner_user_id = auth.uid()
)
with check (
  public.is_admin()
  or owner_user_id = auth.uid()
);

drop policy if exists deals_delete_policy on public.deals;
create policy deals_delete_policy
on public.deals
for delete
to authenticated
using (
  public.is_admin()
  or owner_user_id = auth.uid()
);

commit;
