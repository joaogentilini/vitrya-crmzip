begin;

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
where p.status in ('active', 'published')
  and nullif(btrim(p.city), '') is not null
  and nullif(btrim(p.neighborhood), '') is not null
  and nullif(btrim(p.address), '') is not null
  and p.latitude is not null
  and p.longitude is not null
  and (
    nullif(btrim(p.cover_media_url), '') is not null
    or exists (
      select 1
      from public.property_media pm
      where pm.property_id = p.id
        and pm.kind = 'image'
        and nullif(btrim(pm.url), '') is not null
    )
  );

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

comment on view public.v_public_properties is 'Vitrine publica com guardrails de completude (fase 2).';
comment on view public.v_public_properties_ext is 'Vitrine publica estendida com guardrails de completude (fase 2).';

commit;
