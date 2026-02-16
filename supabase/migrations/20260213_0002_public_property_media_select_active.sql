begin;

drop policy if exists property_media_select on public.property_media;

create policy property_media_select
on public.property_media
for select
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_media.property_id
      and p.status = 'active'
  )
  or exists (
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

commit;
