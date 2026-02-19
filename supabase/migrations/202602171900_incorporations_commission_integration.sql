begin;

-- ============================================================
-- Reuse existing commission pipeline for incorporation units
-- Root tables reused:
--  - public.property_proposals
--  - public.broker_commission_payments
-- ============================================================

-- ------------------------------------------------------------
-- property_proposals: add source/origin columns for incorporations
-- ------------------------------------------------------------
alter table public.property_proposals
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists incorporation_id uuid references public.incorporations(id) on delete set null,
  add column if not exists incorporation_unit_id uuid references public.incorporation_units(id) on delete set null,
  add column if not exists incorporation_reservation_id uuid references public.unit_reservations(id) on delete set null,
  add column if not exists commission_snapshot jsonb;

alter table public.property_proposals
  alter column source_type set default 'property';

update public.property_proposals
set source_type = 'property'
where source_type is null
  and property_id is not null;

update public.property_proposals
set source_id = property_id
where source_id is null
  and property_id is not null;

alter table public.property_proposals
  drop constraint if exists property_proposals_source_type_check;

alter table public.property_proposals
  add constraint property_proposals_source_type_check
  check (source_type is null or source_type in ('property', 'incorporation_unit'));

do $$
declare
  v_property_nullable text;
  v_negotiation_nullable text;
  v_person_nullable text;
begin
  select is_nullable
    into v_property_nullable
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'property_proposals'
     and column_name = 'property_id';

  if v_property_nullable = 'NO' then
    execute 'alter table public.property_proposals alter column property_id drop not null';
  end if;

  select is_nullable
    into v_negotiation_nullable
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'property_proposals'
     and column_name = 'negotiation_id';

  if v_negotiation_nullable = 'NO' then
    execute 'alter table public.property_proposals alter column negotiation_id drop not null';
  end if;

  select is_nullable
    into v_person_nullable
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'property_proposals'
     and column_name = 'person_id';

  if v_person_nullable = 'NO' then
    execute 'alter table public.property_proposals alter column person_id drop not null';
  end if;
end
$$;

create index if not exists property_proposals_source_origin_idx
  on public.property_proposals(source_type, source_id, approved_at desc);

create index if not exists property_proposals_incorporation_origin_idx
  on public.property_proposals(incorporation_id, incorporation_unit_id, approved_at desc);

create index if not exists property_proposals_incorporation_reservation_idx
  on public.property_proposals(incorporation_reservation_id);

-- ------------------------------------------------------------
-- broker_commission_payments: keep same ledger but add origin columns
-- ------------------------------------------------------------
alter table public.broker_commission_payments
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists incorporation_id uuid references public.incorporations(id) on delete set null,
  add column if not exists incorporation_unit_id uuid references public.incorporation_units(id) on delete set null,
  add column if not exists incorporation_reservation_id uuid references public.unit_reservations(id) on delete set null,
  add column if not exists commission_snapshot jsonb;

update public.broker_commission_payments bcp
set
  source_type = coalesce(pp.source_type, 'property'),
  source_id = coalesce(pp.source_id, pp.property_id),
  incorporation_id = pp.incorporation_id,
  incorporation_unit_id = pp.incorporation_unit_id,
  incorporation_reservation_id = pp.incorporation_reservation_id,
  commission_snapshot = coalesce(bcp.commission_snapshot, pp.commission_snapshot)
from public.property_proposals pp
where pp.id = bcp.proposal_id
  and (
    bcp.source_type is null
    or bcp.source_id is null
    or bcp.commission_snapshot is null
  );

alter table public.broker_commission_payments
  drop constraint if exists broker_commission_payments_source_type_check;

alter table public.broker_commission_payments
  add constraint broker_commission_payments_source_type_check
  check (source_type is null or source_type in ('property', 'incorporation_unit'));

create index if not exists broker_commission_payments_source_origin_idx
  on public.broker_commission_payments(source_type, source_id, status, expected_at, received_at);

create index if not exists broker_commission_payments_incorporation_idx
  on public.broker_commission_payments(incorporation_id, incorporation_unit_id, status, expected_at, received_at);

create index if not exists broker_commission_payments_incorp_reservation_idx
  on public.broker_commission_payments(incorporation_reservation_id);

-- ------------------------------------------------------------
-- Atomic conversion: reservation -> sale -> proposal + payment
-- ------------------------------------------------------------
drop function if exists public.convert_unit_reservation_to_sale(uuid, numeric, text);

create or replace function public.convert_unit_reservation_to_sale(
  reservation_id uuid,
  sale_value numeric default null,
  note text default null
)
returns table (
  proposal_id uuid,
  payment_id uuid,
  reservation_id_out uuid,
  unit_id uuid,
  incorporation_id uuid,
  commission_percent numeric,
  commission_value numeric,
  broker_commission_value numeric,
  company_commission_value numeric,
  partner_commission_value numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_reservation public.unit_reservations%rowtype;
  v_unit public.incorporation_units%rowtype;
  v_incorporation public.incorporations%rowtype;
  v_existing_proposal_id uuid;
  v_existing_payment_id uuid;
  v_base_value numeric(14,2);
  v_commission_percent numeric(7,4);
  v_commission_value numeric(14,2);
  v_broker_split numeric(7,4);
  v_company_split numeric(7,4);
  v_partner_split numeric(7,4);
  v_broker_value numeric(14,2);
  v_partner_value numeric(14,2);
  v_company_value numeric(14,2);
  v_owner_net_value numeric(14,2);
  v_snapshot jsonb;
  v_note text;
begin
  if v_actor is null then
    raise exception 'Nao autenticado.' using errcode = '42501';
  end if;

  select p.role
    into v_actor_role
    from public.profiles p
   where p.id = v_actor
     and p.is_active = true
   limit 1;

  if v_actor_role not in ('admin', 'gestor') then
    raise exception 'Sem permissao para converter reserva em venda.' using errcode = '42501';
  end if;

  select *
    into v_reservation
    from public.unit_reservations r
   where r.id = convert_unit_reservation_to_sale.reservation_id
   for update;

  if not found then
    raise exception 'Reserva nao encontrada.' using errcode = 'P0002';
  end if;

  select *
    into v_unit
    from public.incorporation_units iu
   where iu.id = v_reservation.unit_id
   for update;

  if not found then
    raise exception 'Unidade da reserva nao encontrada.' using errcode = 'P0002';
  end if;

  select *
    into v_incorporation
    from public.incorporations i
   where i.id = v_reservation.incorporation_id
   for update;

  if not found then
    raise exception 'Empreendimento da reserva nao encontrado.' using errcode = 'P0002';
  end if;

  select pp.id
    into v_existing_proposal_id
    from public.property_proposals pp
   where pp.source_type = 'incorporation_unit'
     and pp.incorporation_reservation_id = v_reservation.id
   order by pp.created_at desc
   limit 1;

  if v_existing_proposal_id is not null then
    select bcp.id
      into v_existing_payment_id
      from public.broker_commission_payments bcp
     where bcp.proposal_id = v_existing_proposal_id
     order by bcp.created_at desc
     limit 1;

    select
      coalesce(pp.commission_percent, 0),
      coalesce(pp.commission_value, 0),
      coalesce(pp.broker_commission_value, 0),
      coalesce(pp.company_commission_value, 0),
      coalesce(pp.partner_commission_value, 0)
      into
        v_commission_percent,
        v_commission_value,
        v_broker_value,
        v_company_value,
        v_partner_value
      from public.property_proposals pp
     where pp.id = v_existing_proposal_id;

    proposal_id := v_existing_proposal_id;
    payment_id := v_existing_payment_id;
    reservation_id_out := v_reservation.id;
    unit_id := v_unit.id;
    incorporation_id := v_incorporation.id;
    commission_percent := v_commission_percent;
    commission_value := v_commission_value;
    broker_commission_value := v_broker_value;
    company_commission_value := v_company_value;
    partner_commission_value := v_partner_value;
    return next;
    return;
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'A reserva precisa estar ativa para converter em venda.' using errcode = 'P0001';
  end if;

  v_base_value := round(coalesce(convert_unit_reservation_to_sale.sale_value, v_unit.list_price)::numeric, 2);
  if v_base_value is null or v_base_value <= 0 then
    raise exception 'Valor de venda invalido para gerar comissao.' using errcode = 'P0001';
  end if;

  v_commission_percent := coalesce(v_incorporation.commission_percent, 5);
  v_commission_value := round((v_base_value * v_commission_percent / 100.0)::numeric, 2);

  select
    coalesce(p.broker_commission_percent, 50),
    coalesce(p.company_commission_percent, 50),
    coalesce(p.partner_commission_percent, 0)
    into
      v_broker_split,
      v_company_split,
      v_partner_split
    from public.profiles p
   where p.id = v_reservation.broker_user_id
   limit 1;

  if v_broker_split is null then
    v_broker_split := 50;
    v_company_split := 50;
    v_partner_split := 0;
  end if;

  if abs((coalesce(v_broker_split, 0) + coalesce(v_company_split, 0) + coalesce(v_partner_split, 0)) - 100) > 0.01 then
    v_company_split := greatest(0, 100 - coalesce(v_broker_split, 0) - coalesce(v_partner_split, 0));
  end if;

  v_broker_value := round((v_commission_value * coalesce(v_broker_split, 0) / 100.0)::numeric, 2);
  v_partner_value := round((v_commission_value * coalesce(v_partner_split, 0) / 100.0)::numeric, 2);
  v_company_value := round((v_commission_value - v_broker_value - v_partner_value)::numeric, 2);
  v_owner_net_value := round((v_base_value - v_commission_value)::numeric, 2);
  v_note := nullif(trim(convert_unit_reservation_to_sale.note), '');

  v_snapshot := jsonb_build_object(
    'origin', 'incorporation_unit',
    'incorporation_id', v_incorporation.id,
    'incorporation_name', v_incorporation.name,
    'unit_id', v_unit.id,
    'unit_code', v_unit.unit_code,
    'reservation_id', v_reservation.id,
    'base_value', v_base_value,
    'owner_net_value', v_owner_net_value,
    'commission_percent', v_commission_percent,
    'commission_value', v_commission_value,
    'broker_split_percent', v_broker_split,
    'partner_split_percent', v_partner_split,
    'company_split_percent', v_company_split,
    'broker_commission_value', v_broker_value,
    'partner_commission_value', v_partner_value,
    'company_commission_value', v_company_value,
    'generated_by', v_actor,
    'generated_at', now(),
    'note', v_note
  );

  insert into public.property_proposals (
    negotiation_id,
    property_id,
    person_id,
    status,
    title,
    description,
    approved_by_profile_id,
    approved_at,
    sent_at,
    commission_percent,
    commission_value,
    base_value,
    owner_net_value,
    broker_split_percent,
    broker_commission_value,
    partner_split_percent,
    partner_commission_value,
    company_commission_value,
    commission_modality,
    commission_partner_type,
    broker_seller_profile_id,
    broker_buyer_profile_id,
    created_by_profile_id,
    updated_at,
    source_type,
    source_id,
    incorporation_id,
    incorporation_unit_id,
    incorporation_reservation_id,
    commission_snapshot
  )
  values (
    null,
    null,
    null,
    'approved',
    concat('Venda unidade ', coalesce(v_unit.unit_code, '-'), ' - ', coalesce(v_incorporation.name, 'Empreendimento')),
    coalesce(v_note, concat('Conversao automatica da reserva ', v_reservation.id::text)),
    v_actor,
    now(),
    now(),
    v_commission_percent,
    v_commission_value,
    v_base_value,
    v_owner_net_value,
    v_broker_split,
    v_broker_value,
    v_partner_split,
    v_partner_value,
    v_company_value,
    'sale',
    case when coalesce(v_partner_split, 0) > 0 then 'internal' else 'none' end,
    v_reservation.broker_user_id,
    v_actor,
    v_actor,
    now(),
    'incorporation_unit',
    v_unit.id,
    v_incorporation.id,
    v_unit.id,
    v_reservation.id,
    v_snapshot
  )
  returning id into proposal_id;

  insert into public.broker_commission_payments (
    proposal_id,
    broker_profile_id,
    amount,
    status,
    expected_at,
    notes,
    created_by_profile_id,
    source_type,
    source_id,
    incorporation_id,
    incorporation_unit_id,
    incorporation_reservation_id,
    commission_snapshot
  )
  values (
    proposal_id,
    v_reservation.broker_user_id,
    v_broker_value,
    'pending',
    current_date,
    coalesce(v_note, 'Comissao originada de incorporacao/unidade.'),
    v_actor,
    'incorporation_unit',
    v_unit.id,
    v_incorporation.id,
    v_unit.id,
    v_reservation.id,
    v_snapshot
  )
  returning id into payment_id;

  update public.unit_reservations r
     set status = 'converted',
         converted_at = coalesce(r.converted_at, now()),
         released_at = coalesce(r.released_at, now()),
         notes = case
           when v_note is null then r.notes
           else concat_ws(E'\n', r.notes, concat('[', to_char(now(), 'YYYY-MM-DD HH24:MI'), '] ', v_note))
         end,
         updated_at = now()
   where r.id = v_reservation.id;

  update public.incorporation_units iu
     set status = 'sold',
         sold_at = coalesce(iu.sold_at, now()),
         reservation_expires_at = null,
         reserved_at = coalesce(iu.reserved_at, now()),
         reserved_by_user_id = coalesce(iu.reserved_by_user_id, v_reservation.broker_user_id),
         updated_at = now()
   where iu.id = v_unit.id;

  reservation_id_out := v_reservation.id;
  unit_id := v_unit.id;
  incorporation_id := v_incorporation.id;
  commission_percent := v_commission_percent;
  commission_value := v_commission_value;
  broker_commission_value := v_broker_value;
  company_commission_value := v_company_value;
  partner_commission_value := v_partner_value;

  return next;
end;
$$;

grant execute on function public.convert_unit_reservation_to_sale(uuid, numeric, text) to authenticated;

comment on function public.convert_unit_reservation_to_sale(uuid, numeric, text)
  is 'Converte reserva de unidade em venda e gera lancamentos no pipeline de comissao existente.';

commit;
