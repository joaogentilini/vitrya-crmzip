begin;

-- =========================================================
-- 0) PRÉ-CHECKS
-- =========================================================
do $$
declare
  v_missing text := '';
begin
  -- properties
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='properties'
  ) then
    raise exception 'Pré-check falhou: tabela public.properties não existe.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='properties' and column_name='owner_user_id'
  ) then
    v_missing := v_missing || ' properties.owner_user_id';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='properties' and column_name='property_category_id'
  ) then
    v_missing := v_missing || ' properties.property_category_id';
  end if;

  -- property_categories
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='property_categories'
  ) then
    raise exception 'Pré-check falhou: tabela public.property_categories não existe.';
  end if;

  -- tasks existente (vamos reutilizar)
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='tasks'
  ) then
    raise exception 'Pré-check falhou: tabela public.tasks não existe (você enviou colunas dela, então algo está inconsistente).';
  end if;

  -- colunas críticas em tasks
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tasks' and column_name='assigned_to'
  ) then
    v_missing := v_missing || ' tasks.assigned_to';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tasks' and column_name='related_property_id'
  ) then
    v_missing := v_missing || ' tasks.related_property_id';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tasks' and column_name='done'
  ) then
    v_missing := v_missing || ' tasks.done';
  end if;

  -- is_admin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='is_admin'
  ) then
    raise exception 'Pré-check falhou: função public.is_admin() não existe.';
  end if;

  if v_missing <> '' then
    raise exception 'Pré-check falhou: colunas obrigatórias ausentes:%', v_missing;
  end if;
end $$;

-- =========================================================
-- 1) ENUMS (somente para templates/campanhas)
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type public.campaign_status as enum ('active','paused','completed');
  end if;
end $$;

-- =========================================================
-- 2) updated_at helper (se já existe, substitui)
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =========================================================
-- 3) Templates
-- =========================================================
create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  property_category_id uuid not null references public.property_categories(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaign_templates_category
  on public.campaign_templates(property_category_id);

create index if not exists idx_campaign_templates_active
  on public.campaign_templates(is_active);

drop trigger if exists trg_campaign_templates_updated on public.campaign_templates;
create trigger trg_campaign_templates_updated
before update on public.campaign_templates
for each row execute function public.set_updated_at();

create table if not exists public.campaign_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.campaign_templates(id) on delete cascade,
  title text not null,
  description text null,
  -- vamos usar texto compatível com seu tasks.type/status (evita enums novas)
  task_type text not null default 'other',
  offset_days int not null default 0,
  due_hour int not null default 9,
  due_minute int not null default 0,
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_due_hour_valid check (due_hour between 0 and 23),
  constraint chk_due_minute_valid check (due_minute between 0 and 59)
);

create index if not exists idx_campaign_template_items_template
  on public.campaign_template_items(template_id);

drop trigger if exists trg_campaign_template_items_updated on public.campaign_template_items;
create trigger trg_campaign_template_items_updated
before update on public.campaign_template_items
for each row execute function public.set_updated_at();

-- =========================================================
-- 4) Campaigns + Link para tasks existentes
-- =========================================================
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  template_id uuid not null references public.campaign_templates(id) on delete restrict,
  status public.campaign_status not null default 'active',
  start_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_campaigns_property_active
on public.campaigns(property_id)
where status in ('active','paused');

create table if not exists public.campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  template_item_id uuid not null references public.campaign_template_items(id) on delete restrict,
  task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_campaign_items_task on public.campaign_items(task_id);

-- =========================================================
-- 5) Auto-template ao criar categoria
-- =========================================================
create or replace function public.create_default_template_for_category()
returns trigger
language plpgsql
security definer
as $$
declare
  v_template_id uuid;
begin
  if new.is_active is distinct from true then
    return new;
  end if;

  insert into public.campaign_templates(property_category_id, name, is_active)
  values (new.id, new.name || ' — Template Padrão (30 dias)', true)
  returning id into v_template_id;

  insert into public.campaign_template_items(template_id, title, task_type, offset_days, due_hour, due_minute, position)
  values
    (v_template_id, 'Publicar 1 Reels do imóvel (tour rápido 30s)', 'reels', 0, 10, 0, 10),
    (v_template_id, 'Stories: 3 takes + CTA WhatsApp', 'story', 1, 11, 0, 20),
    (v_template_id, 'Post carrossel: pontos fortes + localização', 'post', 3, 10, 0, 30),
    (v_template_id, 'Follow-up na base (leads antigos) com o imóvel', 'whatsapp', 5, 9, 0, 40),
    (v_template_id, 'Reels: “3 motivos para…” (categoria do imóvel)', 'reels', 7, 10, 0, 50),
    (v_template_id, 'Checklist de atualização do anúncio', 'other', 14, 9, 0, 60),
    (v_template_id, 'Reforço de oferta + agendamento de visitas', 'whatsapp', 21, 9, 0, 70),
    (v_template_id, 'Reels de prova social / autoridade', 'reels', 28, 10, 0, 80);

  return new;
end;
$$;

drop trigger if exists trg_property_categories_create_template on public.property_categories;
create trigger trg_property_categories_create_template
after insert on public.property_categories
for each row execute function public.create_default_template_for_category();

-- =========================================================
-- 6) RPC Template CRUD (admin only)
-- =========================================================
create or replace function public.campaign_template_add_item(
  p_template_id uuid,
  p_title text,
  p_description text,
  p_task_type text,
  p_offset_days int,
  p_due_hour int,
  p_due_minute int,
  p_position int
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed';
  end if;

  insert into public.campaign_template_items(
    template_id, title, description, task_type, offset_days, due_hour, due_minute, position
  )
  values (p_template_id, p_title, p_description, p_task_type, p_offset_days, p_due_hour, p_due_minute, p_position)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.campaign_template_update_item(
  p_item_id uuid,
  p_title text,
  p_description text,
  p_task_type text,
  p_offset_days int,
  p_due_hour int,
  p_due_minute int,
  p_position int,
  p_is_active boolean
) returns void
language plpgsql
security definer
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed';
  end if;

  update public.campaign_template_items
  set title = p_title,
      description = p_description,
      task_type = p_task_type,
      offset_days = p_offset_days,
      due_hour = p_due_hour,
      due_minute = p_due_minute,
      position = p_position,
      is_active = p_is_active
  where id = p_item_id;
end;
$$;

create or replace function public.campaign_template_delete_item(p_item_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed';
  end if;

  delete from public.campaign_template_items where id = p_item_id;
end;
$$;

-- =========================================================
-- 7) GERAR CAMPANHA PARA IMÓVEL (cria tasks existentes + vincula)
--     Regras:
--     - assigned_to = properties.owner_user_id
--     - related_property_id = property
--     - due_at = start_date + offset + hora/min
--     - done = false
-- =========================================================
create or replace function public.generate_campaign_for_property(
  p_property_id uuid,
  p_template_id uuid default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_owner uuid;
  v_category uuid;
  v_template uuid;
  v_campaign uuid;
  v_item record;
  v_due timestamptz;
  v_task_id uuid;
begin
  select owner_user_id, property_category_id
    into v_owner, v_category
  from public.properties
  where id = p_property_id;

  if v_owner is null then
    raise exception 'property_not_found_or_missing_owner';
  end if;

  if p_template_id is not null then
    v_template := p_template_id;
  else
    select id into v_template
    from public.campaign_templates
    where property_category_id = v_category
      and is_active = true
    order by created_at desc
    limit 1;
  end if;

  if v_template is null then
    raise exception 'template_not_found_for_category';
  end if;

  insert into public.campaigns(property_id, template_id, status, start_at)
  values (p_property_id, v_template, 'active', now())
  returning id into v_campaign;

  for v_item in
    select *
    from public.campaign_template_items
    where template_id = v_template
      and is_active = true
    order by position asc, offset_days asc
  loop
    v_due := (now()::date + v_item.offset_days)
             + make_interval(hours => v_item.due_hour, mins => v_item.due_minute);

    insert into public.tasks(
      title,
      description,
      due_at,
      done,
      assigned_to,
      related_property_id,
      type,
      status,
      created_by,
      created_at,
      updated_at
    )
    values (
      v_item.title,
      v_item.description,
      v_due,
      false,
      v_owner,
      p_property_id,
      v_item.task_type,
      'todo',
      auth.uid(),
      now(),
      now()
    )
    returning id into v_task_id;

    insert into public.campaign_items(campaign_id, template_item_id, task_id)
    values (v_campaign, v_item.id, v_task_id);
  end loop;

  return v_campaign;
exception
  when unique_violation then
    raise exception 'campaign_already_exists_for_property';
end;
$$;

-- =========================================================
-- 8) RLS
-- =========================================================
alter table public.campaign_templates enable row level security;
alter table public.campaign_template_items enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_items enable row level security;

-- Templates: leitura geral; escrita admin
drop policy if exists ct_select on public.campaign_templates;
create policy ct_select on public.campaign_templates
for select to authenticated
using (true);

drop policy if exists ct_write on public.campaign_templates;
create policy ct_write on public.campaign_templates
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists cti_select on public.campaign_template_items;
create policy cti_select on public.campaign_template_items
for select to authenticated
using (true);

drop policy if exists cti_write on public.campaign_template_items;
create policy cti_write on public.campaign_template_items
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Campaigns: admin tudo; corretor só se for dono do imóvel
drop policy if exists c_select on public.campaigns;
create policy c_select on public.campaigns
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.properties p
    where p.id = campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists c_insert on public.campaigns;
create policy c_insert on public.campaigns
for insert to authenticated
with check (
  public.is_admin()
  or exists (
    select 1 from public.properties p
    where p.id = campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists c_update on public.campaigns;
create policy c_update on public.campaigns
for update to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.properties p
    where p.id = campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.properties p
    where p.id = campaigns.property_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists c_delete on public.campaigns;
create policy c_delete on public.campaigns
for delete to authenticated
using (public.is_admin());

-- Campaign items: leitura seguindo dono do imóvel; escrita admin
drop policy if exists ci_select on public.campaign_items;
create policy ci_select on public.campaign_items
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.campaigns c
    join public.properties p on p.id = c.property_id
    where c.id = campaign_items.campaign_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists ci_write on public.campaign_items;
create policy ci_write on public.campaign_items
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;
