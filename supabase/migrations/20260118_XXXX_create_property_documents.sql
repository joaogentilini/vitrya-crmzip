-- 1) Table
create table if not exists public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  doc_type text not null,
  title text null,
  path text not null,
  mime_type text null,
  size_bytes bigint null,
  created_at timestamptz not null default now(),
  constraint property_documents_doc_type_check
    check (doc_type in ('authorization', 'other'))
);

create index if not exists property_documents_property_id_idx
  on public.property_documents(property_id);

create index if not exists property_documents_property_id_doc_type_idx
  on public.property_documents(property_id, doc_type);

-- 2) RLS
alter table public.property_documents enable row level security;

-- Helper rule: admin ativo OU owner do imóvel
-- Ajuste aqui somente se sua tabela/colunas forem diferentes.
-- Pelo seu projeto, profiles tem role/is_active e properties tem owner_user_id.

drop policy if exists property_documents_select on public.property_documents;
create policy property_documents_select
on public.property_documents
for select
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_documents.property_id
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

drop policy if exists property_documents_insert on public.property_documents;
create policy property_documents_insert
on public.property_documents
for insert
with check (
  exists (
    select 1
    from public.properties p
    where p.id = property_documents.property_id
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

drop policy if exists property_documents_update on public.property_documents;
create policy property_documents_update
on public.property_documents
for update
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_documents.property_id
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
    where p.id = property_documents.property_id
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

drop policy if exists property_documents_delete on public.property_documents;
create policy property_documents_delete
on public.property_documents
for delete
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_documents.property_id
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
