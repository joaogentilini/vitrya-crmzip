begin;

create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.campaign_templates(id) on delete cascade,
  day_offset int not null,
  position int not null,
  title text not null,
  channel text not null,
  is_required boolean not null default false,
  whatsapp_text text null,
  reel_script text null,
  ads_checklist text null,
  created_at timestamptz not null default now()
);

alter table public.campaign_templates
  add column if not exists name text;

alter table public.campaign_templates
  add column if not exists is_active boolean default true;

alter table public.campaign_templates
  add column if not exists created_at timestamptz default now();

alter table public.campaign_template_items
  add column if not exists day_offset int not null default 0;

alter table public.campaign_template_items
  add column if not exists position int not null default 0;

alter table public.campaign_template_items
  add column if not exists title text;

alter table public.campaign_template_items
  add column if not exists channel text not null default 'feed';

alter table public.campaign_template_items
  add column if not exists is_required boolean not null default false;

alter table public.campaign_template_items
  add column if not exists whatsapp_text text;

alter table public.campaign_template_items
  add column if not exists reel_script text;

alter table public.campaign_template_items
  add column if not exists ads_checklist text;

alter table public.campaign_template_items
  add column if not exists created_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_templates'
      and column_name = 'lead_type_id'
      and is_nullable = 'NO'
  ) then
    alter table public.campaign_templates
      alter column lead_type_id drop not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_templates'
      and column_name = 'property_category_id'
      and is_nullable = 'NO'
  ) then
    alter table public.campaign_templates
      alter column property_category_id drop not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaign_template_items_channel_check'
  ) then
    alter table public.campaign_template_items
      add constraint campaign_template_items_channel_check
      check (channel in ('whatsapp','reels','story','feed','ads'));
  end if;
end $$;

create index if not exists idx_campaign_template_items_template_day_position
  on public.campaign_template_items(template_id, day_offset, position);

create index if not exists idx_campaign_templates_active
  on public.campaign_templates(is_active);

commit;
