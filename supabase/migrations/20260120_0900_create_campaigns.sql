-- Migration: Campaigns 30 dias por tipo de imóvel (ligado ao catálogo existente public.lead_types)
-- Cria tabelas: campaign_templates, campaign_template_tasks, property_campaigns, property_campaign_tasks
-- + coluna properties.lead_type_id (FK) + triggers (auto template ao criar lead_type; auto campanha ao publicar imóvel)
-- + backfill de templates para lead_types existentes

-- 0) Safety
set check_function_bodies = off;

-- 1) Garantir coluna de tipo no imóvel (properties.lead_type_id -> lead_types.id)
alter table public.properties
add column if not exists lead_type_id uuid references public.lead_types(id);

create index if not exists properties_lead_type_id_idx on public.properties(lead_type_id);

-- 2) campaign_templates (1 template por lead_type)
create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  lead_type_id uuid not null references public.lead_types(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists campaign_templates_lead_type_idx
on public.campaign_templates(lead_type_id);

-- 3) campaign_template_tasks (tarefas do template)
create table if not exists public.campaign_template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.campaign_templates(id) on delete cascade,
  day_offset int not null,
  title text not null,
  channel text not null,
  is_required boolean not null default true,
  position int not null default 0,
  whatsapp_text text null,
  reel_script text null,
  ads_checklist text null,
  created_at timestamptz not null default now(),
  constraint campaign_template_tasks_channel_check
    check (channel in ('whatsapp','reels','story','feed','ads'))
);

create index if not exists campaign_template_tasks_template_idx
on public.campaign_template_tasks(template_id);

create index if not exists campaign_template_tasks_template_position_idx
on public.campaign_template_tasks(template_id, position);

-- 4) property_campaigns (instância por imóvel)
create table if not exists public.property_campaigns (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  template_id uuid not null references public.campaign_templates(id),
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists property_campaigns_property_idx
on public.property_campaigns(property_id);

-- Evitar duplicar campanha por imóvel
create unique index if not exists property_campaigns_property_unique
on public.property_campaigns(property_id);

-- 5) property_campaign_tasks (instância por imóvel)
create table if not exists public.property_campaign_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  day_offset int not null,
  title text not null,
  channel text not null,
  is_required boolean not null default true,
  due_date date not null,
  done_at timestamptz null,
  whatsapp_text text null,
  reel_script text null,
  ads_checklist text null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint property_campaign_tasks_channel_check
    check (channel in ('whatsapp','reels','story','feed','ads'))
);

create index if not exists property_campaign_tasks_property_due_idx
on public.property_campaign_tasks(property_id, due_date);

-- Opcional, mas recomendado: evita duplicar tasks se algum dia disparar mais de uma vez
create unique index if not exists property_campaign_tasks_unique
on public.property_campaign_tasks(property_id, day_offset, channel, position);

-- 6) RLS and policies

-- campaign_templates: admin/gestor CRUD, qualquer perfil ativo SELECT
alter table public.campaign_templates enable row level security;

drop policy if exists campaign_templates_select on public.campaign_templates;
create policy campaign_templates_select
on public.campaign_templates
for select
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true
  )
);

drop policy if exists campaign_templates_insert on public.campaign_templates;
create policy campaign_templates_insert
on public.campaign_templates
for insert
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
);

drop policy if exists campaign_templates_update on public.campaign_templates;
create policy campaign_templates_update
on public.campaign_templates
for update
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
);

drop policy if exists campaign_templates_delete on public.campaign_templates;
create policy campaign_templates_delete
on public.campaign_templates
for delete
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
);

-- campaign_template_tasks: mesmas regras
alter table public.campaign_template_tasks enable row level security;

drop policy if exists campaign_template_tasks_select on public.campaign_template_tasks;
create policy campaign_template_tasks_select
on public.campaign_template_tasks
for select
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true
  )
);

drop policy if exists campaign_template_tasks_insert on public.campaign_template_tasks;
create policy campaign_template_tasks_insert
on public.campaign_template_tasks
for insert
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
);

drop policy if exists campaign_template_tasks_update on public.campaign_template_tasks;
create policy campaign_template_tasks_update
on public.campaign_template_tasks
for update
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
);

drop policy if exists campaign_template_tasks_delete on public.campaign_template_tasks;
create policy campaign_template_tasks_delete
on public.campaign_template_tasks
for delete
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
);

-- property_campaigns: admin/gestor vê tudo; corretor vê só se for owner do imóvel
alter table public.property_campaigns enable row level security;

drop policy if exists property_campaigns_select on public.property_campaigns;
create policy property_campaigns_select
on public.property_campaigns
for select
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists property_campaigns_insert on public.property_campaigns;
create policy property_campaigns_insert
on public.property_campaigns
for insert
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists property_campaigns_update on public.property_campaigns;
create policy property_campaigns_update
on public.property_campaigns
for update
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists property_campaigns_delete on public.property_campaigns;
create policy property_campaigns_delete
on public.property_campaigns
for delete
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
);

-- property_campaign_tasks: mesmas regras (ownership via properties)
alter table public.property_campaign_tasks enable row level security;

drop policy if exists property_campaign_tasks_select on public.property_campaign_tasks;
create policy property_campaign_tasks_select
on public.property_campaign_tasks
for select
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaign_tasks.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists property_campaign_tasks_insert on public.property_campaign_tasks;
create policy property_campaign_tasks_insert
on public.property_campaign_tasks
for insert
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaign_tasks.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists property_campaign_tasks_update on public.property_campaign_tasks;
create policy property_campaign_tasks_update
on public.property_campaign_tasks
for update
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaign_tasks.property_id
      and p.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaign_tasks.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists property_campaign_tasks_delete on public.property_campaign_tasks;
create policy property_campaign_tasks_delete
on public.property_campaign_tasks
for delete
using (
  exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active = true and pr.role in ('admin','gestor')
  )
  or exists (
    select 1 from public.properties p
    where p.id = public.property_campaign_tasks.property_id
      and p.owner_user_id = auth.uid()
  )
);

-- 7) Triggers

-- 7a) Ao criar novo lead_type (catálogo), criar template e tasks padrão
create or replace function public.fn_create_default_campaign_template_for_lead_type()
returns trigger language plpgsql security definer as $$
declare
  tpl_id uuid;
begin
  insert into public.campaign_templates(lead_type_id, name, is_active)
  values (new.id, concat('Campanha 30 dias - ', new.name), true)
  returning id into tpl_id;

  insert into public.campaign_template_tasks(template_id, day_offset, title, channel, is_required, position)
  values
    (tpl_id, 0,  'Publicar anúncio',            'feed',     true,  0),
    (tpl_id, 3,  'Anunciar nos stories',        'story',    true,  1),
    (tpl_id, 7,  'Enviar WhatsApp para leads',  'whatsapp', true,  2),
    (tpl_id, 14, 'Criar Reels',                 'reels',    false, 3),
    (tpl_id, 21, 'Impulsionar post (ads)',      'ads',      false, 4),
    (tpl_id, 30, 'Revisar performance',         'feed',     false, 5);

  return new;
end;
$$;

drop trigger if exists trg_create_campaign_template_on_lead_types on public.lead_types;
create trigger trg_create_campaign_template_on_lead_types
after insert on public.lead_types
for each row
execute function public.fn_create_default_campaign_template_for_lead_type();

-- 7b) Ao publicar imóvel (status -> 'active') criar instância de campanha e tasks (sem duplicar)
create or replace function public.fn_create_property_campaign_on_publish()
returns trigger language plpgsql security definer as $$
declare
  tpl_id uuid;
  start_dt date := current_date;
  campaign_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.status = 'active' and old.status is distinct from new.status then

      if new.lead_type_id is null then
        return new;
      end if;

      select id into tpl_id
      from public.campaign_templates
      where lead_type_id = new.lead_type_id and is_active = true
      limit 1;

      if tpl_id is null then
        return new;
      end if;

      insert into public.property_campaigns(property_id, template_id, start_date)
      values (new.id, tpl_id, start_dt)
      on conflict (property_id) do nothing
      returning id into campaign_id;

      if campaign_id is null then
        return new;
      end if;

      insert into public.property_campaign_tasks(
        property_id, day_offset, title, channel, is_required, due_date,
        whatsapp_text, reel_script, ads_checklist, position
      )
      select
        new.id,
        t.day_offset,
        t.title,
        t.channel,
        t.is_required,
        (start_dt + (t.day_offset || ' days')::interval)::date,
        t.whatsapp_text,
        t.reel_script,
        t.ads_checklist,
        t.position
      from public.campaign_template_tasks t
      where t.template_id = tpl_id
      order by t.position asc;

    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_create_property_campaign_on_publish on public.properties;
create trigger trg_create_property_campaign_on_publish
after update on public.properties
for each row
when (old.status is distinct from new.status)
execute function public.fn_create_property_campaign_on_publish();

-- 8) Backfill: criar templates (e tasks base) para lead_types já existentes que ainda não têm template
insert into public.campaign_templates (lead_type_id, name, is_active)
select lt.id, concat('Campanha 30 dias - ', lt.name), true
from public.lead_types lt
left join public.campaign_templates ct on ct.lead_type_id = lt.id
where ct.id is null;

-- Para templates recém-criados no backfill, inserir tasks base se estiverem vazios
insert into public.campaign_template_tasks(template_id, day_offset, title, channel, is_required, position)
select ct.id, v.day_offset, v.title, v.channel, v.is_required, v.position
from public.campaign_templates ct
left join public.campaign_template_tasks existing on existing.template_id = ct.id
cross join (values
  (0,  'Publicar anúncio',            'feed',     true,  0),
  (3,  'Anunciar nos stories',        'story',    true,  1),
  (7,  'Enviar WhatsApp para leads',  'whatsapp', true,  2),
  (14, 'Criar Reels',                 'reels',    false, 3),
  (21, 'Impulsionar post (ads)',      'ads',      false, 4),
  (30, 'Revisar performance',         'feed',     false, 5)
) as v(day_offset, title, channel, is_required, position)
where existing.id is null;

-- End of migration
