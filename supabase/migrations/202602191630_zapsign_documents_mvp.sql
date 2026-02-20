begin;

-- ============================================================
-- Assinatura digital (ZapSign) - MVP
-- ============================================================

-- ------------------------------------------------------------
-- Propriedades: metadados de autorização
-- ------------------------------------------------------------
alter table if exists public.properties
  add column if not exists authorization_started_at timestamptz null;

alter table if exists public.properties
  add column if not exists authorization_expires_at timestamptz null;

alter table if exists public.properties
  add column if not exists authorization_is_exclusive boolean not null default false;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
create or replace function public.docs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.docs_is_admin_or_gestor_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  );
$$;

grant execute on function public.docs_is_admin_or_gestor_active() to authenticated;

create or replace function public.docs_can_manage_property(_property_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = _property_id
      and (
        p.owner_user_id = auth.uid()
        or public.docs_is_admin_or_gestor_active()
      )
  );
$$;

grant execute on function public.docs_can_manage_property(uuid) to authenticated;

create or replace function public.docs_can_access_person(_person_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.people pe
    where pe.id = _person_id
      and pe.owner_profile_id = auth.uid()
  );
$$;

grant execute on function public.docs_can_access_person(uuid) to authenticated;

-- ------------------------------------------------------------
-- Templates
-- ------------------------------------------------------------
create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  provider text not null default 'zapsign',
  provider_template_id text null,
  docx_template_path text null,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_document_templates_updated_at on public.document_templates;
create trigger trg_document_templates_updated_at
before update on public.document_templates
for each row execute function public.docs_set_updated_at();

-- ------------------------------------------------------------
-- Instâncias de documentos
-- ------------------------------------------------------------
create table if not exists public.document_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid null references public.document_templates(id) on delete set null,
  template_code text null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'signed', 'refused', 'voided', 'error')),
  provider text not null default 'zapsign',
  provider_document_id text null,
  provider_payload jsonb null,
  entity_type text not null default 'property',
  entity_id uuid null,
  property_id uuid null references public.properties(id) on delete set null,
  owner_person_id uuid null references public.people(id) on delete set null,
  primary_person_id uuid null references public.people(id) on delete set null,
  negotiation_id uuid null,
  lease_id uuid null,
  legacy_document_id uuid null,
  authorization_snapshot jsonb null,
  audit_json jsonb null,
  pdf_original_path text null,
  pdf_signed_path text null,
  audit_trail_path text null,
  sent_at timestamptz null,
  viewed_at timestamptz null,
  signed_at timestamptz null,
  refused_at timestamptz null,
  voided_at timestamptz null,
  provider_signed_at timestamptz null,
  refused_reason text null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.documents') is not null then
    begin
      alter table public.document_instances
        add constraint document_instances_legacy_document_fk
        foreign key (legacy_document_id)
        references public.documents(id)
        on delete set null;
    exception
      when duplicate_object then
        null;
      when undefined_table then
        null;
    end;
  end if;
end $$;

create unique index if not exists document_instances_provider_document_uidx
  on public.document_instances(provider, provider_document_id)
  where provider_document_id is not null;

create index if not exists document_instances_property_status_idx
  on public.document_instances(property_id, status, created_at desc);

create index if not exists document_instances_template_status_idx
  on public.document_instances(template_code, status, created_at desc);

create index if not exists document_instances_owner_person_idx
  on public.document_instances(owner_person_id, created_at desc);

create index if not exists document_instances_primary_person_idx
  on public.document_instances(primary_person_id, created_at desc);

create index if not exists document_instances_created_by_idx
  on public.document_instances(created_by, created_at desc);

create index if not exists document_instances_entity_idx
  on public.document_instances(entity_type, entity_id, created_at desc);

drop trigger if exists trg_document_instances_updated_at on public.document_instances;
create trigger trg_document_instances_updated_at
before update on public.document_instances
for each row execute function public.docs_set_updated_at();

create or replace function public.docs_can_access_instance(_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.document_instances di
    where di.id = _document_id
      and (
        di.created_by = auth.uid()
        or public.docs_is_admin_or_gestor_active()
        or (di.property_id is not null and public.docs_can_manage_property(di.property_id))
        or (di.owner_person_id is not null and public.docs_can_access_person(di.owner_person_id))
        or (di.primary_person_id is not null and public.docs_can_access_person(di.primary_person_id))
      )
  );
$$;

grant execute on function public.docs_can_access_instance(uuid) to authenticated;

-- ------------------------------------------------------------
-- Assinantes
-- ------------------------------------------------------------
create table if not exists public.document_signers (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.document_instances(id) on delete cascade,
  role text not null,
  name text not null,
  email text not null,
  phone text null,
  status text not null default 'pending'
    check (status in ('pending', 'viewed', 'signed', 'refused')),
  viewed_at timestamptz null,
  signed_at timestamptz null,
  provider_signer_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_signers_document_idx
  on public.document_signers(document_id);

create index if not exists document_signers_email_idx
  on public.document_signers(email);

drop trigger if exists trg_document_signers_updated_at on public.document_signers;
create trigger trg_document_signers_updated_at
before update on public.document_signers
for each row execute function public.docs_set_updated_at();

-- ------------------------------------------------------------
-- Eventos (auditoria)
-- ------------------------------------------------------------
create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.document_instances(id) on delete cascade,
  event_type text not null,
  provider_event_id text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_events_document_idx
  on public.document_events(document_id, created_at desc);

create index if not exists document_events_event_type_idx
  on public.document_events(event_type, created_at desc);

-- ------------------------------------------------------------
-- Seeds de templates
-- ------------------------------------------------------------
insert into public.document_templates (code, title, provider, is_active)
values
  ('AUT_VENDA_V1', 'Autorização de Venda', 'zapsign', true),
  ('AUT_GESTAO_V1', 'Autorização de Gestão', 'zapsign', true),
  ('TERM_CHAVES_V1', 'Termo de Chaves', 'zapsign', true),
  ('CONTRATO_CV_V1', 'Contrato Compra e Venda', 'zapsign', true),
  ('CONTRATO_ALUGUEL_V1', 'Contrato de Aluguel', 'zapsign', true),
  ('VISTORIA_LOCACAO_V1', 'Vistoria de Locação', 'zapsign', true)
on conflict (code) do update
set
  title = excluded.title,
  provider = excluded.provider,
  is_active = excluded.is_active;

-- ------------------------------------------------------------
-- Storage (bucket privado "documents")
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/json'
  ]
)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.document_templates enable row level security;
alter table public.document_instances enable row level security;
alter table public.document_signers enable row level security;
alter table public.document_events enable row level security;

drop policy if exists document_templates_select_manager on public.document_templates;
create policy document_templates_select_manager
on public.document_templates
for select
to authenticated
using (public.docs_is_admin_or_gestor_active());

drop policy if exists document_templates_all_manager on public.document_templates;
create policy document_templates_all_manager
on public.document_templates
for all
to authenticated
using (public.docs_is_admin_or_gestor_active())
with check (public.docs_is_admin_or_gestor_active());

drop policy if exists document_instances_select_access on public.document_instances;
create policy document_instances_select_access
on public.document_instances
for select
to authenticated
using (
  created_by = auth.uid()
  or public.docs_is_admin_or_gestor_active()
  or (property_id is not null and public.docs_can_manage_property(property_id))
  or (owner_person_id is not null and public.docs_can_access_person(owner_person_id))
  or (primary_person_id is not null and public.docs_can_access_person(primary_person_id))
);

drop policy if exists document_instances_insert_access on public.document_instances;
create policy document_instances_insert_access
on public.document_instances
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.docs_is_admin_or_gestor_active()
    or (property_id is not null and public.docs_can_manage_property(property_id))
  )
);

drop policy if exists document_instances_update_access on public.document_instances;
create policy document_instances_update_access
on public.document_instances
for update
to authenticated
using (
  created_by = auth.uid()
  or public.docs_is_admin_or_gestor_active()
  or (property_id is not null and public.docs_can_manage_property(property_id))
  or (owner_person_id is not null and public.docs_can_access_person(owner_person_id))
  or (primary_person_id is not null and public.docs_can_access_person(primary_person_id))
)
with check (
  created_by = auth.uid()
  or public.docs_is_admin_or_gestor_active()
  or (property_id is not null and public.docs_can_manage_property(property_id))
  or (owner_person_id is not null and public.docs_can_access_person(owner_person_id))
  or (primary_person_id is not null and public.docs_can_access_person(primary_person_id))
);

drop policy if exists document_instances_delete_access on public.document_instances;
create policy document_instances_delete_access
on public.document_instances
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.docs_is_admin_or_gestor_active()
  or (property_id is not null and public.docs_can_manage_property(property_id))
  or (owner_person_id is not null and public.docs_can_access_person(owner_person_id))
  or (primary_person_id is not null and public.docs_can_access_person(primary_person_id))
);

drop policy if exists document_signers_select_access on public.document_signers;
create policy document_signers_select_access
on public.document_signers
for select
to authenticated
using (public.docs_can_access_instance(document_id));

drop policy if exists document_signers_insert_access on public.document_signers;
create policy document_signers_insert_access
on public.document_signers
for insert
to authenticated
with check (public.docs_can_access_instance(document_id));

drop policy if exists document_signers_update_access on public.document_signers;
create policy document_signers_update_access
on public.document_signers
for update
to authenticated
using (public.docs_can_access_instance(document_id))
with check (public.docs_can_access_instance(document_id));

drop policy if exists document_signers_delete_access on public.document_signers;
create policy document_signers_delete_access
on public.document_signers
for delete
to authenticated
using (public.docs_can_access_instance(document_id));

drop policy if exists document_events_select_access on public.document_events;
create policy document_events_select_access
on public.document_events
for select
to authenticated
using (public.docs_can_access_instance(document_id));

drop policy if exists document_events_insert_access on public.document_events;
create policy document_events_insert_access
on public.document_events
for insert
to authenticated
with check (public.docs_can_access_instance(document_id));

grant select, insert, update, delete on public.document_templates to authenticated;
grant select, insert, update, delete on public.document_instances to authenticated;
grant select, insert, update, delete on public.document_signers to authenticated;
grant select, insert, update, delete on public.document_events to authenticated;

comment on table public.document_templates is 'Templates de documentos para assinatura digital.';
comment on table public.document_instances is 'Instâncias de assinatura digital e snapshots de autorização.';
comment on table public.document_signers is 'Assinantes por documento.';
comment on table public.document_events is 'Eventos/auditoria internos de assinatura.';

commit;
