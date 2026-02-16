begin;

do $$
begin
  if to_regclass('public.property_features') is null then
    raise exception 'Tabela public.property_features nao encontrada.';
  end if;

  if to_regclass('public.property_feature_values') is null then
    raise exception 'Tabela public.property_feature_values nao encontrada.';
  end if;
end
$$;

create temporary table _feature_map (
  old_key text not null,
  new_key text not null
) on commit drop;

insert into _feature_map (old_key, new_key) values
  ('ac_installed', 'ar_condicionado_ou_infra_pronta'),
  ('barbecue', 'area_de_churrasqueira_privativa'),
  ('built_in_furniture', 'marcenaria_planejada_de_alta_qualidade'),
  ('built_in_furniture', 'armarios_planejados'),
  ('cctv', 'cameras_de_seguranca_internas_externas'),
  ('drywall_ceiling', 'teto_rebaixado_em_gesso'),
  ('electric_fence', 'cerca_eletrica_concertina'),
  ('electric_gate', 'portao_eletronico'),
  ('garden', 'jardim_paisagistico'),
  ('gourmet_area', 'espaco_gourmet_externo'),
  ('intercom', 'interfone_video_porteiro'),
  ('led_lighting', 'iluminacao_embutida_spots'),
  ('office', 'home_office_escritorio'),
  ('powder_room', 'lavabo'),
  ('smart_lock', 'fechadura_eletronica_biometria'),
  ('solar_energy', 'aquecimento_a_gas_ou_solar'),
  ('gourmet_balcony', 'varanda_gourmet'),
  ('pool', 'piscina'),
  ('porcelain_floor', 'porcelanato_de_grandes_formatos'),
  ('terrace', 'sacada_envidracada');

create or replace function pg_temp.norm(input text)
returns text
language sql
immutable
as $fn$
  select regexp_replace(
    translate(lower(coalesce(input, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  );
$fn$;

with legacy_rows as (
  select
    v.property_id,
    oldf.key as old_key,
    pg_temp.norm(coalesce(v.value_text, '') || ' ' || coalesce(v.value_json::text, '')) as normalized_text
  from public.property_feature_values v
  join public.property_features oldf on oldf.id = v.feature_id
  where
    oldf.key in (
      select distinct old_key from _feature_map
      union all
      select 'floor_types'
    )
    and (
      v.value_boolean is true
      or v.value_number is not null
      or coalesce(btrim(v.value_text), '') <> ''
      or coalesce(v.value_json::text, '') not in ('', '[]', '{}')
    )
),
direct_targets as (
  select distinct
    lr.property_id,
    fm.new_key
  from legacy_rows lr
  join _feature_map fm on fm.old_key = lr.old_key
),
floor_targets as (
  select distinct
    lr.property_id,
    target.new_key
  from legacy_rows lr
  join lateral (
    select unnest(
      array_remove(
        array[
          case
            when lr.normalized_text like '%porcelan%' then 'porcelanato_de_grandes_formatos'
            else null
          end,
          case
            when lr.normalized_text like '%vinilic%' or lr.normalized_text like '%laminad%' then 'piso_vinilico_laminado'
            else null
          end,
          case
            when lr.normalized_text like '%madeira%' or lr.normalized_text like '%taco%' then 'piso_de_madeira_nobre_taco'
            else null
          end
        ],
        null
      )
    ) as new_key
  ) target on lr.old_key = 'floor_types'
),
all_targets as (
  select property_id, new_key from direct_targets
  union
  select property_id, new_key from floor_targets
)
insert into public.property_feature_values (
  property_id,
  feature_id,
  value_boolean,
  value_number,
  value_text,
  value_json
)
select
  t.property_id,
  nf.id as feature_id,
  true as value_boolean,
  null as value_number,
  null as value_text,
  null as value_json
from all_targets t
join public.property_features nf on nf.key = t.new_key
on conflict (property_id, feature_id)
do update
set value_boolean = true
where public.property_feature_values.value_boolean is distinct from true;

delete from public.property_feature_values v
using public.property_features oldf
where
  oldf.id = v.feature_id
  and oldf.key in (select distinct old_key from _feature_map);

delete from public.property_feature_values v
using public.property_features oldf
where
  oldf.id = v.feature_id
  and oldf.key = 'floor_types'
  and (
    pg_temp.norm(coalesce(v.value_text, '') || ' ' || coalesce(v.value_json::text, '')) like '%porcelan%'
    or pg_temp.norm(coalesce(v.value_text, '') || ' ' || coalesce(v.value_json::text, '')) like '%vinilic%'
    or pg_temp.norm(coalesce(v.value_text, '') || ' ' || coalesce(v.value_json::text, '')) like '%laminad%'
    or pg_temp.norm(coalesce(v.value_text, '') || ' ' || coalesce(v.value_json::text, '')) like '%madeira%'
    or pg_temp.norm(coalesce(v.value_text, '') || ' ' || coalesce(v.value_json::text, '')) like '%taco%'
  );

commit;
