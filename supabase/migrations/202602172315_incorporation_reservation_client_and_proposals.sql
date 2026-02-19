begin;

-- ============================================================
-- 1) Reserva com observacao de cliente (interna do corretor)
-- ============================================================
drop function if exists public.reserve_unit(uuid, uuid, text);
drop function if exists public.reserve_unit(uuid, uuid);

create or replace function public.reserve_unit(
  unit_id uuid,
  lead_id uuid default null,
  client_note text default null
)
returns table (
  reservation_id uuid,
  reserved_unit_id uuid,
  reserved_incorporation_id uuid,
  unit_status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_unit public.incorporation_units%rowtype;
  v_expires_at timestamptz;
  v_reservation_id uuid;
  v_existing_reservation_id uuid;
  v_existing_expires_at timestamptz;
  v_client_note text := nullif(trim(client_note), '');
begin
  if v_actor is null then
    raise exception 'Nao autenticado.' using errcode = '42501';
  end if;

  select p.role
    into v_role
    from public.profiles p
   where p.id = v_actor
     and p.is_active = true
   limit 1;

  if v_role is null or v_role not in ('admin', 'gestor', 'corretor') then
    raise exception 'Sem permissao para reservar unidade.' using errcode = '42501';
  end if;

  select iu.*
    into v_unit
    from public.incorporation_units iu
   where iu.id = reserve_unit.unit_id
   for update;

  if not found then
    raise exception 'Unidade nao encontrada.' using errcode = 'P0002';
  end if;

  if v_unit.status in ('sold', 'blocked') then
    raise exception 'Unidade indisponivel para reserva.' using errcode = 'P0001';
  end if;

  update public.unit_reservations r
     set status = 'expired',
         released_at = coalesce(r.released_at, now()),
         updated_at = now()
   where r.unit_id = v_unit.id
     and r.status = 'active'
     and r.expires_at <= now();

  if v_unit.status = 'reserved' and coalesce(v_unit.reservation_expires_at, now()) <= now() then
    update public.incorporation_units iu
       set status = 'available',
           reserved_by_user_id = null,
           reserved_at = null,
           reservation_expires_at = null,
           updated_at = now()
     where iu.id = v_unit.id;
  end if;

  select r.id, r.expires_at
    into v_existing_reservation_id, v_existing_expires_at
    from public.unit_reservations r
   where r.unit_id = v_unit.id
     and r.status = 'active'
     and r.expires_at > now()
   order by r.created_at desc
   limit 1;

  if v_existing_reservation_id is not null then
    if v_unit.reserved_by_user_id = v_actor then
      return query
      select
        v_existing_reservation_id,
        v_unit.id,
        v_unit.incorporation_id,
        'reserved'::text,
        v_existing_expires_at;
      return;
    end if;

    raise exception 'Unidade ja reservada no momento.' using errcode = 'P0001';
  end if;

  if v_unit.status not in ('available', 'reserved') then
    raise exception 'Unidade indisponivel para reserva.' using errcode = 'P0001';
  end if;

  v_expires_at := now() + interval '30 minutes';

  insert into public.unit_reservations (
    unit_id,
    incorporation_id,
    broker_user_id,
    lead_id,
    status,
    expires_at,
    notes
  )
  values (
    v_unit.id,
    v_unit.incorporation_id,
    v_actor,
    reserve_unit.lead_id,
    'active',
    v_expires_at,
    v_client_note
  )
  returning id into v_reservation_id;

  update public.incorporation_units iu
     set status = 'reserved',
         reserved_by_user_id = v_actor,
         reserved_at = now(),
         reservation_expires_at = v_expires_at,
         updated_at = now()
   where iu.id = v_unit.id;

  return query
  select
    v_reservation_id,
    v_unit.id,
    v_unit.incorporation_id,
    'reserved'::text,
    v_expires_at;
end;
$$;

grant execute on function public.reserve_unit(uuid, uuid, text) to authenticated;

comment on function public.reserve_unit(uuid, uuid, text)
  is 'Reserva atomica de unidade com lead opcional e observacao interna do cliente.';

-- ============================================================
-- 2) Proposta comercial para envio a incorporadora
-- ============================================================
create table if not exists public.incorporation_client_proposals (
  id uuid primary key default gen_random_uuid(),
  incorporation_id uuid not null references public.incorporations(id) on delete cascade,
  unit_id uuid not null references public.incorporation_units(id) on delete restrict,
  reservation_id uuid null references public.unit_reservations(id) on delete set null,
  broker_user_id uuid not null references public.profiles(id) on delete restrict,
  lead_id uuid null references public.leads(id) on delete set null,
  client_name text not null,
  client_email text null,
  client_phone text null,
  offer_value numeric(14,2) not null,
  down_payment numeric(14,2) null,
  financing_type text null,
  payment_terms text null,
  proposal_text text null,
  recipient_email text null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'under_review', 'approved', 'rejected', 'cancelled')),
  sent_at timestamptz null,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incorporation_client_proposals_incorp_idx
  on public.incorporation_client_proposals(incorporation_id, created_at desc);

create index if not exists incorporation_client_proposals_reservation_idx
  on public.incorporation_client_proposals(reservation_id, created_at desc);

create index if not exists incorporation_client_proposals_broker_idx
  on public.incorporation_client_proposals(broker_user_id, status, created_at desc);

create index if not exists incorporation_client_proposals_unit_idx
  on public.incorporation_client_proposals(unit_id, created_at desc);

drop trigger if exists trg_incorporation_client_proposals_updated_at on public.incorporation_client_proposals;
create trigger trg_incorporation_client_proposals_updated_at
before update on public.incorporation_client_proposals
for each row execute function public.incorp_set_updated_at();

alter table public.incorporation_client_proposals enable row level security;

drop policy if exists incorporation_client_proposals_select_own_or_manager on public.incorporation_client_proposals;
create policy incorporation_client_proposals_select_own_or_manager
on public.incorporation_client_proposals
for select
to authenticated
using (
  broker_user_id = auth.uid()
  or public.incorp_is_admin_or_gestor_active()
);

drop policy if exists incorporation_client_proposals_insert_internal on public.incorporation_client_proposals;
create policy incorporation_client_proposals_insert_internal
on public.incorporation_client_proposals
for insert
to authenticated
with check (
  public.incorp_is_internal_active_user()
  and (
    broker_user_id = auth.uid()
    or public.incorp_is_admin_or_gestor_active()
  )
);

drop policy if exists incorporation_client_proposals_update_own_or_manager on public.incorporation_client_proposals;
create policy incorporation_client_proposals_update_own_or_manager
on public.incorporation_client_proposals
for update
to authenticated
using (
  broker_user_id = auth.uid()
  or public.incorp_is_admin_or_gestor_active()
)
with check (
  broker_user_id = auth.uid()
  or public.incorp_is_admin_or_gestor_active()
);

drop policy if exists incorporation_client_proposals_delete_manager on public.incorporation_client_proposals;
create policy incorporation_client_proposals_delete_manager
on public.incorporation_client_proposals
for delete
to authenticated
using (public.incorp_is_admin_or_gestor_active());

comment on table public.incorporation_client_proposals is 'Propostas comerciais de unidades para envio a incorporadora.';

commit;
