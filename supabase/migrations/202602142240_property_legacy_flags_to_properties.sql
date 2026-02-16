begin;

do $$
begin
  if to_regclass('public.properties') is null then
    raise exception 'Tabela public.properties nao encontrada.';
  end if;

  if to_regclass('public.property_features') is null then
    raise exception 'Tabela public.property_features nao encontrada.';
  end if;

  if to_regclass('public.property_feature_values') is null then
    raise exception 'Tabela public.property_feature_values nao encontrada.';
  end if;
end
$$;

alter table public.properties
  add column if not exists accepts_financing boolean,
  add column if not exists accepts_trade boolean,
  add column if not exists property_standard text,
  add column if not exists artesian_well boolean;

create or replace function pg_temp.coerce_bool(
  in_value_boolean boolean,
  in_value_text text,
  in_value_json jsonb
)
returns boolean
language plpgsql
immutable
as $fn$
declare
  normalized_text text;
  json_type text;
begin
  if in_value_boolean is not null then
    return in_value_boolean;
  end if;

  if in_value_json is not null then
    json_type := jsonb_typeof(in_value_json);

    if json_type = 'boolean' then
      return (in_value_json::text)::boolean;
    end if;

    if json_type = 'number' then
      return (in_value_json::text)::numeric <> 0;
    end if;

    if json_type = 'array' then
      return jsonb_array_length(in_value_json) > 0;
    end if;

    if json_type = 'string' then
      normalized_text := lower(trim(both '"' from in_value_json::text));
    end if;
  end if;

  if normalized_text is null then
    normalized_text := lower(btrim(coalesce(in_value_text, '')));
  end if;

  if normalized_text in ('1', 'true', 't', 'yes', 'y', 'sim', 's') then
    return true;
  end if;

  if normalized_text in ('0', 'false', 'f', 'no', 'n', 'nao') then
    return false;
  end if;

  return null;
end;
$fn$;

create or replace function pg_temp.coerce_text(
  in_value_text text,
  in_value_json jsonb
)
returns text
language plpgsql
immutable
as $fn$
declare
  json_type text;
  resolved_text text;
begin
  resolved_text := nullif(btrim(coalesce(in_value_text, '')), '');
  if resolved_text is not null then
    return resolved_text;
  end if;

  if in_value_json is null then
    return null;
  end if;

  json_type := jsonb_typeof(in_value_json);
  if json_type = 'string' then
    return nullif(trim(both '"' from in_value_json::text), '');
  end if;

  return null;
end;
$fn$;

create temporary table _legacy_values on commit drop as
select
  v.property_id,
  f.key as feature_key,
  pg_temp.coerce_bool(v.value_boolean, v.value_text, v.value_json) as bool_value,
  pg_temp.coerce_text(v.value_text, v.value_json) as text_value
from public.property_feature_values v
join public.property_features f on f.id = v.feature_id
where f.key in (
  'accepts_financing',
  'accepts_trade',
  'property_standard',
  'artesian_well'
);

update public.properties p
set
  accepts_financing = coalesce(p.accepts_financing, src.accepts_financing),
  accepts_trade = coalesce(p.accepts_trade, src.accepts_trade),
  artesian_well = coalesce(p.artesian_well, src.artesian_well)
from (
  select
    property_id,
    bool_or(bool_value) filter (where feature_key = 'accepts_financing') as accepts_financing,
    bool_or(bool_value) filter (where feature_key = 'accepts_trade') as accepts_trade,
    bool_or(bool_value) filter (where feature_key = 'artesian_well') as artesian_well
  from _legacy_values
  group by property_id
) src
where p.id = src.property_id;

update public.properties p
set property_standard = coalesce(
  nullif(btrim(p.property_standard), ''),
  src.property_standard
)
from (
  select distinct on (property_id)
    property_id,
    text_value as property_standard
  from _legacy_values
  where feature_key = 'property_standard'
    and text_value is not null
  order by property_id, length(text_value) desc, text_value asc
) src
where p.id = src.property_id;

delete from public.property_feature_values v
using public.property_features f
where
  f.id = v.feature_id
  and f.key in (
    'accepts_financing',
    'accepts_trade',
    'property_standard',
    'artesian_well'
  );

commit;
