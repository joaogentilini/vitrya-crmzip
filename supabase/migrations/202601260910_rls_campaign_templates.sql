begin;

alter table public.campaign_templates enable row level security;
alter table public.campaign_template_items enable row level security;

drop policy if exists campaign_templates_select on public.campaign_templates;
drop policy if exists campaign_templates_insert on public.campaign_templates;
drop policy if exists campaign_templates_update on public.campaign_templates;
drop policy if exists campaign_templates_delete on public.campaign_templates;
drop policy if exists ct_select on public.campaign_templates;
drop policy if exists ct_write on public.campaign_templates;

drop policy if exists campaign_template_items_select on public.campaign_template_items;
drop policy if exists campaign_template_items_insert on public.campaign_template_items;
drop policy if exists campaign_template_items_update on public.campaign_template_items;
drop policy if exists campaign_template_items_delete on public.campaign_template_items;
drop policy if exists cti_select on public.campaign_template_items;
drop policy if exists cti_write on public.campaign_template_items;

create policy campaign_templates_select_active
on public.campaign_templates
for select
using (
  auth.uid() is not null
  and (
    is_active = true
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.role in ('admin','gestor')
    )
  )
);

create policy campaign_templates_insert_admin
on public.campaign_templates
for insert
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.role in ('admin','gestor')
  )
);

create policy campaign_templates_update_admin
on public.campaign_templates
for update
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.role in ('admin','gestor')
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.role in ('admin','gestor')
  )
);

create policy campaign_templates_delete_admin
on public.campaign_templates
for delete
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.role in ('admin','gestor')
  )
);

create policy campaign_template_items_select
on public.campaign_template_items
for select
using (
  auth.uid() is not null
  and (
    exists (
      select 1
      from public.campaign_templates ct
      where ct.id = campaign_template_items.template_id
        and ct.is_active = true
    )
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.role in ('admin','gestor')
    )
  )
);

create policy campaign_template_items_insert_admin
on public.campaign_template_items
for insert
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.role in ('admin','gestor')
  )
);

create policy campaign_template_items_update_admin
on public.campaign_template_items
for update
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.role in ('admin','gestor')
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.role in ('admin','gestor')
  )
);

create policy campaign_template_items_delete_admin
on public.campaign_template_items
for delete
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.role in ('admin','gestor')
  )
);

commit;
