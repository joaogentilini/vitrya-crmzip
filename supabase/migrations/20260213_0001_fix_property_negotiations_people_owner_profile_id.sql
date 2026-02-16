begin;

drop policy if exists pn_select on public.property_negotiations;
drop policy if exists pn_insert on public.property_negotiations;
drop policy if exists pn_update on public.property_negotiations;
drop policy if exists pn_delete on public.property_negotiations;

create policy pn_select
on public.property_negotiations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.properties p
    where p.id = property_negotiations.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.people pe
    where pe.id = property_negotiations.person_id
      and pe.owner_profile_id = auth.uid()
  )
);

create policy pn_insert
on public.property_negotiations
for insert
to authenticated
with check (
  created_by_profile_id = auth.uid()
  and (
    exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid()
        and pr.is_active = true
        and pr.role in ('admin', 'gestor')
    )
    or exists (
      select 1
      from public.properties p
      where p.id = property_negotiations.property_id
        and p.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.people pe
      where pe.id = property_negotiations.person_id
        and pe.owner_profile_id = auth.uid()
    )
  )
);

create policy pn_update
on public.property_negotiations
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.properties p
    where p.id = property_negotiations.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.people pe
    where pe.id = property_negotiations.person_id
      and pe.owner_profile_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.properties p
    where p.id = property_negotiations.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.people pe
    where pe.id = property_negotiations.person_id
      and pe.owner_profile_id = auth.uid()
  )
);

create policy pn_delete
on public.property_negotiations
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.properties p
    where p.id = property_negotiations.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.people pe
    where pe.id = property_negotiations.person_id
      and pe.owner_profile_id = auth.uid()
  )
);

commit;

