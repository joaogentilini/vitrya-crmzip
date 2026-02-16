begin;

alter table public.property_proposals enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'property_proposals'
  loop
    execute format('drop policy if exists %I on public.property_proposals', pol.policyname);
  end loop;
end
$$;

create policy property_proposals_select
on public.property_proposals
for select
to authenticated
using (
  created_by_profile_id = auth.uid()
  or broker_seller_profile_id = auth.uid()
  or broker_buyer_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.properties p
    where p.id = property_proposals.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.property_negotiations pn
    where pn.id = property_proposals.negotiation_id
      and pn.created_by_profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.property_negotiations pn
    join public.people pe on pe.id = pn.person_id
    where pn.id = property_proposals.negotiation_id
      and pe.owner_profile_id = auth.uid()
  )
);

create policy property_proposals_insert
on public.property_proposals
for insert
to authenticated
with check (
  created_by_profile_id = auth.uid()
  and (
    broker_seller_profile_id = auth.uid()
    or broker_buyer_profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid()
        and pr.is_active = true
        and pr.role in ('admin', 'gestor')
    )
    or exists (
      select 1
      from public.properties p
      where p.id = property_proposals.property_id
        and p.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.property_negotiations pn
      where pn.id = property_proposals.negotiation_id
        and pn.created_by_profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.property_negotiations pn
      join public.people pe on pe.id = pn.person_id
      where pn.id = property_proposals.negotiation_id
        and pe.owner_profile_id = auth.uid()
    )
  )
);

create policy property_proposals_update
on public.property_proposals
for update
to authenticated
using (
  created_by_profile_id = auth.uid()
  or broker_seller_profile_id = auth.uid()
  or broker_buyer_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.properties p
    where p.id = property_proposals.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.property_negotiations pn
    where pn.id = property_proposals.negotiation_id
      and pn.created_by_profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.property_negotiations pn
    join public.people pe on pe.id = pn.person_id
    where pn.id = property_proposals.negotiation_id
      and pe.owner_profile_id = auth.uid()
  )
)
with check (
  created_by_profile_id = auth.uid()
  or broker_seller_profile_id = auth.uid()
  or broker_buyer_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.properties p
    where p.id = property_proposals.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.property_negotiations pn
    where pn.id = property_proposals.negotiation_id
      and pn.created_by_profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.property_negotiations pn
    join public.people pe on pe.id = pn.person_id
    where pn.id = property_proposals.negotiation_id
      and pe.owner_profile_id = auth.uid()
  )
);

create policy property_proposals_delete
on public.property_proposals
for delete
to authenticated
using (
  created_by_profile_id = auth.uid()
  or broker_seller_profile_id = auth.uid()
  or broker_buyer_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  )
  or exists (
    select 1
    from public.properties p
    where p.id = property_proposals.property_id
      and p.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.property_negotiations pn
    where pn.id = property_proposals.negotiation_id
      and pn.created_by_profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.property_negotiations pn
    join public.people pe on pe.id = pn.person_id
    where pn.id = property_proposals.negotiation_id
      and pe.owner_profile_id = auth.uid()
  )
);

commit;
