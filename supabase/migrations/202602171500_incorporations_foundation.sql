begin;

-- ============================================================
-- Foundations: Incorporations / Developments module
-- ============================================================

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
create or replace function public.incorp_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.incorp_is_admin_or_gestor_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin', 'gestor')
  );
$$;

grant execute on function public.incorp_is_admin_or_gestor_active() to authenticated;

create or replace function public.incorp_is_internal_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin', 'gestor', 'corretor')
  );
$$;

grant execute on function public.incorp_is_internal_active_user() to authenticated;

-- ------------------------------------------------------------
-- Developers
-- ------------------------------------------------------------
create table if not exists public.developers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  legal_name text null,
  cnpj text null,
  website_url text null,
  description text null,
  logo_media_path text null,
  cover_media_path text null,
  is_active boolean not null default true,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists developers_slug_uidx on public.developers (slug);
create index if not exists developers_is_active_name_idx on public.developers (is_active, name);

drop trigger if exists trg_developers_updated_at on public.developers;
create trigger trg_developers_updated_at
before update on public.developers
for each row execute function public.incorp_set_updated_at();

-- ------------------------------------------------------------
-- Incorporations
-- ------------------------------------------------------------
create table if not exists public.incorporations (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  slug text not null,
  name text not null,
  headline text null,
  description text null,
  city text null,
  neighborhood text null,
  state text null,
  address text null,
  postal_code text null,
  latitude numeric(10,7) null,
  longitude numeric(10,7) null,
  ri_number text null,
  ri_office text null,
  delivery_date date null,
  launch_date date null,
  status text not null default 'draft'
    check (status in ('draft', 'pre_launch', 'launch', 'construction', 'delivered', 'paused', 'archived')),
  is_active boolean not null default false,
  commission_percent numeric(7,4) not null default 5,
  price_from numeric(14,2) null,
  cover_media_path text null,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists incorporations_slug_uidx on public.incorporations (slug);
create index if not exists incorporations_developer_idx on public.incorporations (developer_id, created_at desc);
create index if not exists incorporations_active_status_idx on public.incorporations (is_active, status, created_at desc);
create index if not exists incorporations_city_neighborhood_idx on public.incorporations (city, neighborhood);

drop trigger if exists trg_incorporations_updated_at on public.incorporations;
create trigger trg_incorporations_updated_at
before update on public.incorporations
for each row execute function public.incorp_set_updated_at();

-- ------------------------------------------------------------
-- Incorporation plans
-- ------------------------------------------------------------
create table if not exists public.incorporation_plans (
  id uuid primary key default gen_random_uuid(),
  incorporation_id uuid not null references public.incorporations(id) on delete cascade,
  name text not null,
  bedrooms integer null,
  suites integer null,
  bathrooms integer null,
  parking integer null,
  area_m2 numeric(10,2) null,
  description text null,
  price_from numeric(14,2) null,
  is_active boolean not null default true,
  position integer not null default 0,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incorporation_plans_incorporation_idx
  on public.incorporation_plans (incorporation_id, is_active, position, created_at desc);

drop trigger if exists trg_incorporation_plans_updated_at on public.incorporation_plans;
create trigger trg_incorporation_plans_updated_at
before update on public.incorporation_plans
for each row execute function public.incorp_set_updated_at();

-- ------------------------------------------------------------
-- Incorporation media
-- ------------------------------------------------------------
create table if not exists public.incorporation_media (
  id uuid primary key default gen_random_uuid(),
  incorporation_id uuid not null references public.incorporations(id) on delete cascade,
  plan_id uuid null references public.incorporation_plans(id) on delete cascade,
  kind text not null default 'image'
    check (kind in ('image', 'video', 'document', 'floorplate')),
  title text null,
  path text not null,
  is_public boolean not null default true,
  is_cover boolean not null default false,
  position integer not null default 0,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incorporation_media_incorporation_idx
  on public.incorporation_media (incorporation_id, position, created_at desc);
create index if not exists incorporation_media_plan_idx
  on public.incorporation_media (plan_id, position, created_at desc);
create unique index if not exists incorporation_media_cover_incorporation_uidx
  on public.incorporation_media (incorporation_id)
  where is_cover = true and plan_id is null;
create unique index if not exists incorporation_media_cover_plan_uidx
  on public.incorporation_media (plan_id)
  where is_cover = true and plan_id is not null;

drop trigger if exists trg_incorporation_media_updated_at on public.incorporation_media;
create trigger trg_incorporation_media_updated_at
before update on public.incorporation_media
for each row execute function public.incorp_set_updated_at();

-- ------------------------------------------------------------
-- Incorporation units
-- ------------------------------------------------------------
create table if not exists public.incorporation_units (
  id uuid primary key default gen_random_uuid(),
  incorporation_id uuid not null references public.incorporations(id) on delete cascade,
  plan_id uuid null references public.incorporation_plans(id) on delete set null,
  unit_code text not null,
  tower text null,
  floor integer not null default 0,
  stack text not null default 'A',
  bedrooms integer null,
  suites integer null,
  bathrooms integer null,
  parking integer null,
  area_m2 numeric(10,2) null,
  list_price numeric(14,2) null,
  status text not null default 'available'
    check (status in ('available', 'reserved', 'sold', 'blocked')),
  reserved_by_user_id uuid null references public.profiles(id) on delete set null,
  reserved_at timestamptz null,
  reservation_expires_at timestamptz null,
  sold_at timestamptz null,
  notes text null,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incorporation_units_code_per_incorp_uidx unique (incorporation_id, unit_code)
);

create index if not exists incorporation_units_status_idx
  on public.incorporation_units (incorporation_id, status, floor desc, stack, unit_code);
create index if not exists incorporation_units_floor_stack_idx
  on public.incorporation_units (incorporation_id, floor desc, stack);
create index if not exists incorporation_units_plan_idx
  on public.incorporation_units (plan_id);

drop trigger if exists trg_incorporation_units_updated_at on public.incorporation_units;
create trigger trg_incorporation_units_updated_at
before update on public.incorporation_units
for each row execute function public.incorp_set_updated_at();

-- ------------------------------------------------------------
-- Unit reservations
-- ------------------------------------------------------------
create table if not exists public.unit_reservations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.incorporation_units(id) on delete cascade,
  incorporation_id uuid not null references public.incorporations(id) on delete cascade,
  broker_user_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid null references public.leads(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'expired', 'cancelled', 'converted')),
  expires_at timestamptz not null,
  released_at timestamptz null,
  converted_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists unit_reservations_unit_idx
  on public.unit_reservations (unit_id, created_at desc);
create index if not exists unit_reservations_broker_idx
  on public.unit_reservations (broker_user_id, status, expires_at desc);
create index if not exists unit_reservations_incorporation_idx
  on public.unit_reservations (incorporation_id, status, created_at desc);
create unique index if not exists unit_reservations_one_active_per_unit_uidx
  on public.unit_reservations (unit_id)
  where status = 'active';

drop trigger if exists trg_unit_reservations_updated_at on public.unit_reservations;
create trigger trg_unit_reservations_updated_at
before update on public.unit_reservations
for each row execute function public.incorp_set_updated_at();

-- ------------------------------------------------------------
-- Atomic reservation RPC
-- ------------------------------------------------------------
drop function if exists public.reserve_unit(uuid, uuid);

create or replace function public.reserve_unit(unit_id uuid, lead_id uuid default null)
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

  -- Expira reservas ativas vencidas dessa unidade antes de validar disponibilidade.
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
    expires_at
  )
  values (
    v_unit.id,
    v_unit.incorporation_id,
    v_actor,
    reserve_unit.lead_id,
    'active',
    v_expires_at
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

grant execute on function public.reserve_unit(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.developers enable row level security;
alter table public.incorporations enable row level security;
alter table public.incorporation_plans enable row level security;
alter table public.incorporation_media enable row level security;
alter table public.incorporation_units enable row level security;
alter table public.unit_reservations enable row level security;

-- Developers
drop policy if exists developers_select_internal on public.developers;
create policy developers_select_internal
on public.developers
for select
to authenticated
using (public.incorp_is_internal_active_user());

drop policy if exists developers_select_public_active on public.developers;
create policy developers_select_public_active
on public.developers
for select
to anon
using (is_active = true);

drop policy if exists developers_manager_all on public.developers;
create policy developers_manager_all
on public.developers
for all
to authenticated
using (public.incorp_is_admin_or_gestor_active())
with check (public.incorp_is_admin_or_gestor_active());

-- Incorporations
drop policy if exists incorporations_select_internal on public.incorporations;
create policy incorporations_select_internal
on public.incorporations
for select
to authenticated
using (public.incorp_is_internal_active_user());

drop policy if exists incorporations_select_public_active on public.incorporations;
create policy incorporations_select_public_active
on public.incorporations
for select
to anon
using (is_active = true);

drop policy if exists incorporations_manager_all on public.incorporations;
create policy incorporations_manager_all
on public.incorporations
for all
to authenticated
using (public.incorp_is_admin_or_gestor_active())
with check (public.incorp_is_admin_or_gestor_active());

-- Plans
drop policy if exists incorporation_plans_select_internal on public.incorporation_plans;
create policy incorporation_plans_select_internal
on public.incorporation_plans
for select
to authenticated
using (public.incorp_is_internal_active_user());

drop policy if exists incorporation_plans_select_public_active on public.incorporation_plans;
create policy incorporation_plans_select_public_active
on public.incorporation_plans
for select
to anon
using (
  is_active = true
  and exists (
    select 1
    from public.incorporations i
    where i.id = incorporation_plans.incorporation_id
      and i.is_active = true
  )
);

drop policy if exists incorporation_plans_manager_all on public.incorporation_plans;
create policy incorporation_plans_manager_all
on public.incorporation_plans
for all
to authenticated
using (public.incorp_is_admin_or_gestor_active())
with check (public.incorp_is_admin_or_gestor_active());

-- Media
drop policy if exists incorporation_media_select_internal on public.incorporation_media;
create policy incorporation_media_select_internal
on public.incorporation_media
for select
to authenticated
using (public.incorp_is_internal_active_user());

drop policy if exists incorporation_media_select_public_active on public.incorporation_media;
create policy incorporation_media_select_public_active
on public.incorporation_media
for select
to anon
using (
  is_public = true
  and exists (
    select 1
    from public.incorporations i
    where i.id = incorporation_media.incorporation_id
      and i.is_active = true
  )
);

drop policy if exists incorporation_media_manager_all on public.incorporation_media;
create policy incorporation_media_manager_all
on public.incorporation_media
for all
to authenticated
using (public.incorp_is_admin_or_gestor_active())
with check (public.incorp_is_admin_or_gestor_active());

-- Units
drop policy if exists incorporation_units_select_internal on public.incorporation_units;
create policy incorporation_units_select_internal
on public.incorporation_units
for select
to authenticated
using (public.incorp_is_internal_active_user());

drop policy if exists incorporation_units_manager_all on public.incorporation_units;
create policy incorporation_units_manager_all
on public.incorporation_units
for all
to authenticated
using (public.incorp_is_admin_or_gestor_active())
with check (public.incorp_is_admin_or_gestor_active());

-- Reservations
drop policy if exists unit_reservations_select_own_or_manager on public.unit_reservations;
create policy unit_reservations_select_own_or_manager
on public.unit_reservations
for select
to authenticated
using (
  broker_user_id = auth.uid()
  or public.incorp_is_admin_or_gestor_active()
);

drop policy if exists unit_reservations_insert_self on public.unit_reservations;
create policy unit_reservations_insert_self
on public.unit_reservations
for insert
to authenticated
with check (
  public.incorp_is_internal_active_user()
  and broker_user_id = auth.uid()
);

drop policy if exists unit_reservations_manager_update on public.unit_reservations;
create policy unit_reservations_manager_update
on public.unit_reservations
for update
to authenticated
using (public.incorp_is_admin_or_gestor_active())
with check (public.incorp_is_admin_or_gestor_active());

drop policy if exists unit_reservations_manager_delete on public.unit_reservations;
create policy unit_reservations_manager_delete
on public.unit_reservations
for delete
to authenticated
using (public.incorp_is_admin_or_gestor_active());

-- ------------------------------------------------------------
-- Storage bucket: incorporation-media (private)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incorporation-media',
  'incorporation-media',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists incorporation_media_objects_select_internal on storage.objects;
create policy incorporation_media_objects_select_internal
on storage.objects
for select
to authenticated
using (
  bucket_id = 'incorporation-media'
  and public.incorp_is_internal_active_user()
);

drop policy if exists incorporation_media_objects_insert_manager on storage.objects;
create policy incorporation_media_objects_insert_manager
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'incorporation-media'
  and public.incorp_is_admin_or_gestor_active()
);

drop policy if exists incorporation_media_objects_update_manager on storage.objects;
create policy incorporation_media_objects_update_manager
on storage.objects
for update
to authenticated
using (
  bucket_id = 'incorporation-media'
  and public.incorp_is_admin_or_gestor_active()
)
with check (
  bucket_id = 'incorporation-media'
  and public.incorp_is_admin_or_gestor_active()
);

drop policy if exists incorporation_media_objects_delete_manager on storage.objects;
create policy incorporation_media_objects_delete_manager
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'incorporation-media'
  and public.incorp_is_admin_or_gestor_active()
);

comment on table public.developers is 'Construtoras/incorporadoras.';
comment on table public.incorporations is 'Empreendimentos de incorporacao.';
comment on table public.incorporation_plans is 'Plantas/tipologias por empreendimento.';
comment on table public.incorporation_media is 'Midias de empreendimento e de planta.';
comment on table public.incorporation_units is 'Unidades do espelho de disponibilidade.';
comment on table public.unit_reservations is 'Reservas instantaneas de unidades por corretor.';
comment on function public.reserve_unit(uuid, uuid) is 'Reserva atomica de unidade com expiracao de 30 minutos.';

commit;
