begin;

-- ============================================================
-- Mapa/localização de imóveis + snapshot manual de proximidades
-- ============================================================

alter table if exists public.properties
  add column if not exists location_source text null;

alter table if exists public.properties
  add column if not exists location_updated_at timestamptz null;

alter table if exists public.properties
  add column if not exists latitude numeric(10,7) null;

alter table if exists public.properties
  add column if not exists longitude numeric(10,7) null;

do $$
begin
  if to_regclass('public.properties') is not null then
    alter table public.properties
      drop constraint if exists properties_location_source_check;

    alter table public.properties
      add constraint properties_location_source_check
      check (
        location_source is null
        or location_source in ('manual_pin', 'autocomplete', 'device_gps')
      );
  end if;
end $$;

create table if not exists public.property_amenities_snapshot (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  radius_m integer not null default 1000,
  data jsonb not null,
  generated_at timestamptz not null default now(),
  generated_by uuid null references public.profiles(id) on delete set null,
  source text not null default 'google_places',
  version integer not null default 1
);

create index if not exists property_amenities_snapshot_property_generated_idx
  on public.property_amenities_snapshot(property_id, generated_at desc);

create index if not exists property_amenities_snapshot_generated_by_idx
  on public.property_amenities_snapshot(generated_by, generated_at desc);

alter table public.property_amenities_snapshot enable row level security;

drop policy if exists property_amenities_snapshot_select on public.property_amenities_snapshot;
create policy property_amenities_snapshot_select
on public.property_amenities_snapshot
for select
to authenticated
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_amenities_snapshot.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.is_active = true
            and pr.role in ('admin', 'gestor')
        )
      )
  )
);

drop policy if exists property_amenities_snapshot_insert on public.property_amenities_snapshot;
create policy property_amenities_snapshot_insert
on public.property_amenities_snapshot
for insert
to authenticated
with check (
  exists (
    select 1
    from public.properties p
    where p.id = property_amenities_snapshot.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.is_active = true
            and pr.role in ('admin', 'gestor')
        )
      )
  )
);

drop policy if exists property_amenities_snapshot_update on public.property_amenities_snapshot;
create policy property_amenities_snapshot_update
on public.property_amenities_snapshot
for update
to authenticated
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_amenities_snapshot.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.is_active = true
            and pr.role in ('admin', 'gestor')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.properties p
    where p.id = property_amenities_snapshot.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.is_active = true
            and pr.role in ('admin', 'gestor')
        )
      )
  )
);

drop policy if exists property_amenities_snapshot_delete on public.property_amenities_snapshot;
create policy property_amenities_snapshot_delete
on public.property_amenities_snapshot
for delete
to authenticated
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_amenities_snapshot.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.is_active = true
            and pr.role in ('admin', 'gestor')
        )
      )
  )
);

grant select, insert, update, delete on public.property_amenities_snapshot to authenticated;

create or replace view public.v_public_property_amenities_latest as
select distinct on (pas.property_id)
  pas.property_id,
  pas.radius_m,
  pas.data,
  pas.generated_at
from public.property_amenities_snapshot pas
join public.properties p on p.id = pas.property_id
where p.status = 'active'
order by pas.property_id, pas.generated_at desc, pas.id desc;

grant select on public.v_public_property_amenities_latest to anon, authenticated, service_role;

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
  p.latitude as latitude,
  p.longitude as longitude
from public.v_public_properties vp
left join public.property_categories pc on pc.id = vp.property_category_id
left join public.properties p on p.id = vp.id
left join public.profiles pr on pr.id = p.owner_user_id;

grant select on public.v_public_properties_ext to anon, authenticated, service_role;

comment on table public.property_amenities_snapshot is 'Snapshot manual de proximidades por imóvel (Google Places).';
comment on column public.property_amenities_snapshot.data is 'Estrutura consolidada de categorias e itens próximos.';

commit;
