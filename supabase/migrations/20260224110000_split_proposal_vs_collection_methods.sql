-- Stage 0: separar metodo comercial da proposta de metodo de cobranca
-- Idempotente

create table if not exists public.proposal_payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists proposal_payment_methods_code_uq
  on public.proposal_payment_methods (code);

create unique index if not exists proposal_payment_methods_name_uq
  on public.proposal_payment_methods (lower(name));

insert into public.proposal_payment_methods (code, name, is_active, position)
values
  ('cash', 'A vista', true, 10),
  ('installments', 'Parcelado direto', true, 20),
  ('financing', 'Financiamento', true, 30),
  ('consortium', 'Consorcio', true, 40),
  ('trade', 'Permuta', true, 50),
  ('other', 'Outro', true, 99)
on conflict (code) do update
set
  name = excluded.name,
  is_active = excluded.is_active,
  position = excluded.position;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'proposal_payment_methods_code_check'
      and conrelid = 'public.proposal_payment_methods'::regclass
  ) then
    alter table public.proposal_payment_methods
      add constraint proposal_payment_methods_code_check
      check (code in ('cash', 'installments', 'financing', 'consortium', 'trade', 'other'));
  end if;
end $$;

create table if not exists public.collection_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists collection_methods_code_uq
  on public.collection_methods (code);

create unique index if not exists collection_methods_name_uq
  on public.collection_methods (lower(name));

insert into public.collection_methods (code, name, is_active, position)
values
  ('boleto', 'Boleto', true, 10),
  ('pix', 'PIX', true, 20)
on conflict (code) do update
set
  name = excluded.name,
  is_active = excluded.is_active,
  position = excluded.position;

do $$
begin
  if to_regclass('public.property_proposal_payments') is not null then
    alter table public.property_proposal_payments
      add column if not exists proposal_payment_method_id uuid null;

    alter table public.property_proposal_payments
      drop constraint if exists property_proposal_payments_proposal_payment_method_id_fkey;

    alter table public.property_proposal_payments
      add constraint property_proposal_payments_proposal_payment_method_id_fkey
      foreign key (proposal_payment_method_id)
      references public.proposal_payment_methods(id)
      on delete set null;
  end if;

  if to_regclass('public.receivables') is not null then
    alter table public.receivables
      add column if not exists proposal_payment_method_id uuid null;

    alter table public.receivables
      drop constraint if exists receivables_proposal_payment_method_id_fkey;

    alter table public.receivables
      add constraint receivables_proposal_payment_method_id_fkey
      foreign key (proposal_payment_method_id)
      references public.proposal_payment_methods(id)
      on delete set null;

    alter table public.receivables
      add column if not exists collection_method_id uuid null;

    alter table public.receivables
      drop constraint if exists receivables_collection_method_id_fkey;

    alter table public.receivables
      add constraint receivables_collection_method_id_fkey
      foreign key (collection_method_id)
      references public.collection_methods(id)
      on delete set null;
  end if;

  if to_regclass('public.payments') is not null then
    alter table public.payments
      add column if not exists proposal_payment_method_id uuid null;

    alter table public.payments
      drop constraint if exists payments_proposal_payment_method_id_fkey;

    alter table public.payments
      add constraint payments_proposal_payment_method_id_fkey
      foreign key (proposal_payment_method_id)
      references public.proposal_payment_methods(id)
      on delete set null;

    alter table public.payments
      add column if not exists collection_method_id uuid null;

    alter table public.payments
      drop constraint if exists payments_collection_method_id_fkey;

    alter table public.payments
      add constraint payments_collection_method_id_fkey
      foreign key (collection_method_id)
      references public.collection_methods(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.property_proposal_payments') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'property_proposal_payments'
         and indexname = 'property_proposal_payments_proposal_payment_method_idx'
     ) then
    execute 'create index property_proposal_payments_proposal_payment_method_idx on public.property_proposal_payments(proposal_payment_method_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_proposal_payment_method_idx'
     ) then
    execute 'create index receivables_proposal_payment_method_idx on public.receivables(proposal_payment_method_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_collection_method_idx'
     ) then
    execute 'create index receivables_collection_method_idx on public.receivables(collection_method_id)';
  end if;

  if to_regclass('public.payments') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'payments'
         and indexname = 'payments_proposal_payment_method_idx'
     ) then
    execute 'create index payments_proposal_payment_method_idx on public.payments(proposal_payment_method_id)';
  end if;

  if to_regclass('public.payments') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'payments'
         and indexname = 'payments_collection_method_idx'
     ) then
    execute 'create index payments_collection_method_idx on public.payments(collection_method_id)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.property_proposal_payments') is not null then
    with normalized as (
      select
        ppp.id,
        case
          when lower(trim(coalesce(ppp.method, ''))) in ('cash', 'dinheiro', 'a vista', 'avista', 'a_vista', 'a-vista', 'a vista (pix)')
            then 'cash'
          when lower(trim(coalesce(ppp.method, ''))) in ('installments', 'parcelado', 'parcelado direto', 'parcelado_direto')
            or lower(trim(coalesce(ppp.method, ''))) like 'parcel%'
            then 'installments'
          when lower(trim(coalesce(ppp.method, ''))) in ('financing', 'financiamento')
            then 'financing'
          when lower(trim(coalesce(ppp.method, ''))) in ('consortium', 'consorcio', 'consorcio')
            then 'consortium'
          when lower(trim(coalesce(ppp.method, ''))) in ('trade', 'permuta')
            then 'trade'
          else 'other'
        end as method_code
      from public.property_proposal_payments ppp
      where ppp.proposal_payment_method_id is null
    )
    update public.property_proposal_payments ppp
    set proposal_payment_method_id = ppm.id
    from normalized n
    join public.proposal_payment_methods ppm
      on ppm.code = n.method_code
    where ppp.id = n.id
      and ppp.proposal_payment_method_id is null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.receivables') is not null and to_regclass('public.asaas_charges') is not null then
    with billing_map as (
      select
        r.id as receivable_id,
        upper(trim(coalesce(
          ac.payload ->> 'billingType',
          ac.payload ->> 'billing_type',
          ac.payload -> 'charge' ->> 'billingType',
          ac.payload -> 'charge' ->> 'billing_type',
          ''
        ))) as billing_type,
        ac.pix_payload,
        ac.bank_slip_url,
        ac.bank_slip_pdf
      from public.receivables r
      left join public.asaas_charges ac
        on ac.receivable_id = r.id
      where r.collection_method_id is null
        and coalesce(r.external_provider, '') = 'asaas'
    )
    update public.receivables r
    set collection_method_id = case
      when bm.billing_type = 'PIX'
        then (select id from public.collection_methods where code = 'pix' limit 1)
      when bm.billing_type = 'BOLETO'
        then (select id from public.collection_methods where code = 'boleto' limit 1)
      when coalesce(bm.pix_payload, '') <> '' and coalesce(bm.bank_slip_url, '') = '' and coalesce(bm.bank_slip_pdf, '') = ''
        then (select id from public.collection_methods where code = 'pix' limit 1)
      when coalesce(bm.bank_slip_url, '') <> '' or coalesce(bm.bank_slip_pdf, '') <> ''
        then (select id from public.collection_methods where code = 'boleto' limit 1)
      else null
    end
    from billing_map bm
    where r.id = bm.receivable_id
      and r.collection_method_id is null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.receivables') is not null and to_regclass('public.property_proposal_payments') is not null then
    update public.receivables r
    set proposal_payment_method_id = ppp.proposal_payment_method_id
    from public.property_proposal_payments ppp
    where r.origin_type = 'property_proposal_payment'
      and r.origin_id = ppp.id
      and r.proposal_payment_method_id is null
      and ppp.proposal_payment_method_id is not null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.payments') is not null and to_regclass('public.receivables') is not null then
    update public.payments p
    set
      proposal_payment_method_id = coalesce(p.proposal_payment_method_id, r.proposal_payment_method_id),
      collection_method_id = coalesce(p.collection_method_id, r.collection_method_id)
    from public.receivables r
    where p.receivable_id = r.id
      and (p.proposal_payment_method_id is null or p.collection_method_id is null);
  end if;
end $$;

