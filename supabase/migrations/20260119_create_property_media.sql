-- 1) Table
create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  url text not null,
  kind text not null,
  position int not null,
  created_at timestamptz not null default now(),
  constraint property_media_kind_check
    check (kind in ('image', 'video'))
);

create index if not exists property_media_property_id_idx
  on public.property_media(property_id);

create index if not exists property_media_property_id_position_idx
  on public.property_media(property_id, position);

-- 2) RLS
alter table public.property_media enable row level security;

-- Helper rule: admin ativo OU owner do imóvel
drop policy if exists property_media_select on public.property_media;
create policy property_media_select
on public.property_media
for select
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_media.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.role = 'admin'
            and pr.is_active = true
        )
      )
  )
);

drop policy if exists property_media_insert on public.property_media;
create policy property_media_insert
on public.property_media
for insert
with check (
  exists (
    select 1
    from public.properties p
    where p.id = property_media.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.role = 'admin'
            and pr.is_active = true
        )
      )
  )
);

drop policy if exists property_media_update on public.property_media;
create policy property_media_update
on public.property_media
for update
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_media.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.role = 'admin'
            and pr.is_active = true
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.properties p
    where p.id = property_media.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = property_media.property_id
            and (
              p.owner_user_id = auth.uid()
              or exists (
                select 1
                from public.profiles pr
                where pr.id = auth.uid()
                  and pr.role = 'admin'
                  and pr.is_active = true
              )
            )
        )
      )
  )
);

drop policy if exists property_media_delete on public.property_media;
create policy property_media_delete
on public.property_media
for delete
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_media.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.role = 'admin'
            and pr.is_active = true
        )
      )
  )
);