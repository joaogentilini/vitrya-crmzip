begin;

alter table public.profiles
  add column if not exists avatar_focus_x integer not null default 50,
  add column if not exists avatar_focus_y integer not null default 50,
  add column if not exists avatar_zoom numeric(4,2) not null default 1.00;

alter table public.profiles
  drop constraint if exists profiles_avatar_focus_x_check;

alter table public.profiles
  add constraint profiles_avatar_focus_x_check
  check (avatar_focus_x >= 0 and avatar_focus_x <= 100);

alter table public.profiles
  drop constraint if exists profiles_avatar_focus_y_check;

alter table public.profiles
  add constraint profiles_avatar_focus_y_check
  check (avatar_focus_y >= 0 and avatar_focus_y <= 100);

alter table public.profiles
  drop constraint if exists profiles_avatar_zoom_check;

alter table public.profiles
  add constraint profiles_avatar_zoom_check
  check (avatar_zoom >= 1 and avatar_zoom <= 3);

drop view if exists public.v_public_properties_ext;
drop view if exists public.v_public_brokers;

create view public.v_public_brokers as
select
  p.id,
  p.full_name,
  p.public_name,
  p.role,
  p.phone,
  p.phone_e164,
  p.email,
  p.is_active,
  p.creci,
  p.tagline,
  p.bio,
  p.avatar_url,
  p.instagram_url,
  p.facebook_url,
  p.tiktok_url,
  p.youtube_url,
  p.linkedin_url,
  p.website_url,
  p.avatar_focus_x,
  p.avatar_focus_y,
  p.avatar_zoom
from public.profiles p
where p.is_active = true
  and p.role in ('corretor', 'gestor', 'admin');

create view public.v_public_properties_ext as
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
  pr.avatar_zoom as broker_avatar_zoom
from public.v_public_properties vp
left join public.property_categories pc on pc.id = vp.property_category_id
left join public.properties p on p.id = vp.id
left join public.profiles pr on pr.id = p.owner_user_id;

grant select on public.v_public_brokers to anon, authenticated, service_role;
grant select on public.v_public_properties_ext to anon, authenticated, service_role;

commit;
