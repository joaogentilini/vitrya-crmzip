begin;

-- ============================================================
-- 1) Comissao por construtora (fonte de verdade)
-- ============================================================
alter table public.developers
  add column if not exists commission_percent numeric(7,4) not null default 5;

alter table public.developers
  drop constraint if exists developers_commission_percent_check;

alter table public.developers
  add constraint developers_commission_percent_check
  check (commission_percent >= 0 and commission_percent <= 100);

update public.developers d                                                     
  set commission_percent = src.commission_percent                                
  from (                                                                         
    select distinct on (i.developer_id)                                          
      i.developer_id,                                                            
      i.commission_percent                                                       
    from public.incorporations i                                                 
    where i.commission_percent is not null                                       
    order by i.developer_id, i.updated_at desc nulls last, i.created_at desc     
  nulls last                                                                     
  ) src                                                                          
  where src.developer_id = d.id;

-- ============================================================
-- 2) Midias com escopo para heranca por tipologia
-- ============================================================
alter table public.incorporation_media
  add column if not exists media_scope text not null default 'incorporation';

update public.incorporation_media
set media_scope = case
  when plan_id is not null then 'plan'
  else coalesce(media_scope, 'incorporation')
end
where media_scope is null
   or media_scope = '';

alter table public.incorporation_media
  drop constraint if exists incorporation_media_scope_check;

alter table public.incorporation_media
  add constraint incorporation_media_scope_check
  check (media_scope in ('incorporation', 'common_areas', 'project', 'plan'));

create index if not exists incorporation_media_scope_idx
  on public.incorporation_media(incorporation_id, media_scope, position, created_at desc);

-- ============================================================
-- 3) Caracteristicas dinamicas de empreendimento
-- ============================================================
create table if not exists public.incorporation_features (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_pt text not null,
  group_name text null,
  type text not null check (type in ('boolean', 'text', 'enum', 'multi_enum', 'number')),
  options jsonb null,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.incorporation_feature_values (
  incorporation_id uuid not null references public.incorporations(id) on delete cascade,
  feature_id uuid not null references public.incorporation_features(id) on delete cascade,
  value_boolean boolean null,
  value_number numeric(14,4) null,
  value_text text null,
  value_json jsonb null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (incorporation_id, feature_id)
);

create index if not exists incorporation_features_active_position_idx
  on public.incorporation_features(is_active, position, label_pt);

create index if not exists incorporation_feature_values_incorp_idx
  on public.incorporation_feature_values(incorporation_id);

create index if not exists incorporation_feature_values_feature_idx
  on public.incorporation_feature_values(feature_id);

create or replace function public.incorporation_features_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_incorporation_features_set_updated_at on public.incorporation_features;
create trigger trg_incorporation_features_set_updated_at
before update on public.incorporation_features
for each row execute function public.incorporation_features_set_updated_at();

drop trigger if exists trg_incorporation_feature_values_set_updated_at on public.incorporation_feature_values;
create trigger trg_incorporation_feature_values_set_updated_at
before update on public.incorporation_feature_values
for each row execute function public.incorporation_features_set_updated_at();

alter table public.incorporation_features enable row level security;
alter table public.incorporation_feature_values enable row level security;

drop policy if exists incorporation_features_select_internal on public.incorporation_features;
create policy incorporation_features_select_internal
on public.incorporation_features
for select
to authenticated
using (public.incorp_is_internal_active_user());

drop policy if exists incorporation_features_select_public on public.incorporation_features;
create policy incorporation_features_select_public
on public.incorporation_features
for select
to anon
using (is_active = true);

drop policy if exists incorporation_features_manager_all on public.incorporation_features;
create policy incorporation_features_manager_all
on public.incorporation_features
for all
to authenticated
using (public.incorp_is_admin_or_gestor_active())
with check (public.incorp_is_admin_or_gestor_active());

drop policy if exists incorporation_feature_values_select_internal on public.incorporation_feature_values;
create policy incorporation_feature_values_select_internal
on public.incorporation_feature_values
for select
to authenticated
using (public.incorp_is_internal_active_user());

drop policy if exists incorporation_feature_values_select_public on public.incorporation_feature_values;
create policy incorporation_feature_values_select_public
on public.incorporation_feature_values
for select
to anon
using (
  exists (
    select 1
    from public.incorporations i
    where i.id = incorporation_feature_values.incorporation_id
      and i.is_active = true
  )
);

drop policy if exists incorporation_feature_values_manager_all on public.incorporation_feature_values;
create policy incorporation_feature_values_manager_all
on public.incorporation_feature_values
for all
to authenticated
using (public.incorp_is_admin_or_gestor_active())
with check (public.incorp_is_admin_or_gestor_active());

insert into public.incorporation_features (key, label_pt, group_name, type, options, is_active, position)
select
  pf.key,
  pf.label_pt,
  pf.group,
  pf.type,
  pf.options,
  pf.is_active,
  pf.position
from public.property_features pf
where not exists (
  select 1
  from public.incorporation_features inf
  where inf.key = pf.key
);

-- ============================================================
-- 4) Conversao de reserva em venda usando comissao da construtora
-- ============================================================
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
  v_developer_commission_percent numeric(7,4);
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

  select d.commission_percent
    into v_developer_commission_percent
    from public.developers d
   where d.id = v_incorporation.developer_id
   limit 1;

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

  v_commission_percent := coalesce(v_developer_commission_percent, v_incorporation.commission_percent, 5);
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
    'developer_id', v_incorporation.developer_id,
    'developer_commission_percent', v_developer_commission_percent,
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

comment on table public.incorporation_features is 'Catalogo de caracteristicas dinamicas de empreendimento.';
comment on table public.incorporation_feature_values is 'Valores dinamicos por empreendimento (herdados pelas tipologias).';

commit;
