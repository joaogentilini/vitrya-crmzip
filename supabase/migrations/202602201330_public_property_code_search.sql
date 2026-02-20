begin;

-- Public code for quick property search in public storefront
alter table if exists public.properties
  add column if not exists public_code text;

create sequence if not exists public.property_public_code_seq
  as bigint
  increment by 1
  minvalue 1
  start with 1;

do $$
declare
  max_code bigint := 0;
begin
  select coalesce(
    max((regexp_match(upper(public_code), '^COD-([0-9]+)$'))[1]::bigint),
    0
  )
  into max_code
  from public.properties
  where public_code is not null;

  perform setval('public.property_public_code_seq', greatest(max_code, 1), max_code > 0);
end $$;

create or replace function public.generate_property_public_code()
returns text
language plpgsql
as $$
begin
  return 'COD-' || lpad(nextval('public.property_public_code_seq')::text, 6, '0');
end;
$$;

update public.properties
set public_code = public.generate_property_public_code()
where public_code is null or btrim(public_code) = '';

update public.properties
set public_code = upper(btrim(public_code))
where public_code is not null
  and public_code <> upper(btrim(public_code));

create unique index if not exists properties_public_code_unique
  on public.properties (public_code)
  where public_code is not null;

create or replace function public.trg_set_property_public_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_code is null or btrim(new.public_code) = '' then
    new.public_code := public.generate_property_public_code();
  else
    new.public_code := upper(btrim(new.public_code));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_properties_set_public_code on public.properties;
create trigger trg_properties_set_public_code
before insert on public.properties
for each row
execute function public.trg_set_property_public_code();

create or replace view public.v_public_properties as
select
  p.id,
  p.title,
  p.description,
  p.status,
  p.purpose,
  p.price,
  p.rent_price,
  p.city,
  p.neighborhood,
  p.property_category_id,
  p.cover_media_url,
  p.created_at,
  p.public_code
from public.properties p
where p.status in ('active', 'published');

grant select on public.v_public_properties to anon, authenticated, service_role;

create or replace view public.v_public_properties_ext as
select
  vp.id,
  vp.title,
  vp.description,
  vp.status,
  vp.purpose,
  vp.price,
  vp.rent_price,
  vp.city,
  vp.neighborhood,
  vp.property_category_id,
  vp.cover_media_url,
  vp.created_at,
  pc.name as property_category_name,

  p.owner_user_id as broker_id,
  pr.full_name as broker_full_name,
  pr.public_name as broker_public_name,
  pr.creci as broker_creci,
  pr.phone as broker_phone,
  pr.phone_e164 as broker_phone_e164,
  pr.email as broker_email,
  pr.avatar_url as broker_avatar_url,
  pr.tagline as broker_tagline,
  pr.bio as broker_bio,
  pr.instagram_url as broker_instagram_url,
  pr.facebook_url as broker_facebook_url,
  pr.tiktok_url as broker_tiktok_url,
  pr.youtube_url as broker_youtube_url,
  pr.linkedin_url as broker_linkedin_url,
  pr.website_url as broker_website_url,

  p.address,
  p.area_m2,
  p.built_area_m2,
  p.land_area_m2,
  p.bedrooms,
  p.bathrooms,
  p.parking,
  p.suites,
  pr.avatar_focus_x as broker_avatar_focus_x,
  pr.avatar_focus_y as broker_avatar_focus_y,
  pr.avatar_zoom as broker_avatar_zoom,
  p.latitude,
  p.longitude,
  vp.public_code
from public.v_public_properties vp
left join public.property_categories pc on pc.id = vp.property_category_id
left join public.properties p on p.id = vp.id
left join public.profiles pr on pr.id = p.owner_user_id;

grant select on public.v_public_properties_ext to anon, authenticated, service_role;

comment on column public.properties.public_code is 'Codigo publico simples do imovel para busca rapida na vitrine.';

commit;
