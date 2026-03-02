-- Stage 0: snapshots de proposta + dimensoes de lead ate receivables
-- Idempotente

do $$
begin
  if to_regclass('public.property_proposals') is not null then
    alter table public.property_proposals
      add column if not exists lead_id uuid null references public.leads(id) on delete set null;

    alter table public.property_proposals
      add column if not exists lead_type_id uuid null references public.lead_types(id) on delete set null;

    alter table public.property_proposals
      add column if not exists lead_interest_id uuid null references public.lead_interests(id) on delete set null;

    alter table public.property_proposals
      add column if not exists lead_source_id uuid null references public.lead_sources(id) on delete set null;

    alter table public.property_proposals
      add column if not exists property_category_id uuid null references public.property_categories(id) on delete set null;

    alter table public.property_proposals
      add column if not exists business_line_id uuid null references public.business_lines(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.receivables') is not null then
    alter table public.receivables
      add column if not exists lead_id uuid null references public.leads(id) on delete set null;

    alter table public.receivables
      add column if not exists lead_type_id uuid null references public.lead_types(id) on delete set null;

    alter table public.receivables
      add column if not exists lead_interest_id uuid null references public.lead_interests(id) on delete set null;

    alter table public.receivables
      add column if not exists lead_source_id uuid null references public.lead_sources(id) on delete set null;

    alter table public.receivables
      add column if not exists property_category_id uuid null references public.property_categories(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.property_proposals') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'property_proposals'
         and indexname = 'property_proposals_lead_source_idx'
     ) then
    execute 'create index property_proposals_lead_source_idx on public.property_proposals(lead_source_id)';
  end if;

  if to_regclass('public.property_proposals') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'property_proposals'
         and indexname = 'property_proposals_lead_type_idx'
     ) then
    execute 'create index property_proposals_lead_type_idx on public.property_proposals(lead_type_id)';
  end if;

  if to_regclass('public.property_proposals') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'property_proposals'
         and indexname = 'property_proposals_lead_interest_idx'
     ) then
    execute 'create index property_proposals_lead_interest_idx on public.property_proposals(lead_interest_id)';
  end if;

  if to_regclass('public.property_proposals') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'property_proposals'
         and indexname = 'property_proposals_property_category_idx'
     ) then
    execute 'create index property_proposals_property_category_idx on public.property_proposals(property_category_id)';
  end if;

  if to_regclass('public.property_proposals') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'property_proposals'
         and indexname = 'property_proposals_business_line_idx_v2'
     ) then
    execute 'create index property_proposals_business_line_idx_v2 on public.property_proposals(business_line_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_lead_source_idx'
     ) then
    execute 'create index receivables_lead_source_idx on public.receivables(lead_source_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_lead_type_idx'
     ) then
    execute 'create index receivables_lead_type_idx on public.receivables(lead_type_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_lead_interest_idx'
     ) then
    execute 'create index receivables_lead_interest_idx on public.receivables(lead_interest_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_property_category_idx_v2'
     ) then
    execute 'create index receivables_property_category_idx_v2 on public.receivables(property_category_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_business_line_idx_v2'
     ) then
    execute 'create index receivables_business_line_idx_v2 on public.receivables(business_line_id)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.property_proposals') is not null and to_regclass('public.properties') is not null then
    update public.property_proposals pp
    set property_category_id = p.property_category_id
    from public.properties p
    where pp.property_id = p.id
      and pp.property_category_id is null
      and p.property_category_id is not null;

    update public.property_proposals pp
    set business_line_id = p.business_line_id
    from public.properties p
    where pp.property_id = p.id
      and pp.business_line_id is null
      and p.business_line_id is not null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.property_proposals') is not null
     and to_regclass('public.property_negotiations') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'property_negotiations'
         and column_name = 'lead_id'
     ) then
    update public.property_proposals pp
    set lead_id = pn.lead_id
    from public.property_negotiations pn
    where pp.negotiation_id = pn.id
      and pp.lead_id is null
      and pn.lead_id is not null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.property_proposals') is not null and to_regclass('public.leads') is not null then
    update public.property_proposals pp
    set
      lead_type_id = coalesce(pp.lead_type_id, l.lead_type_id),
      lead_interest_id = coalesce(pp.lead_interest_id, l.lead_interest_id),
      lead_source_id = coalesce(pp.lead_source_id, l.lead_source_id)
    from public.leads l
    where pp.lead_id = l.id
      and (
        pp.lead_type_id is null
        or pp.lead_interest_id is null
        or pp.lead_source_id is null
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.receivables') is not null and to_regclass('public.property_proposals') is not null then
    -- Origin: property_proposal
    update public.receivables r
    set
      lead_id = coalesce(r.lead_id, pp.lead_id),
      lead_type_id = coalesce(r.lead_type_id, pp.lead_type_id),
      lead_interest_id = coalesce(r.lead_interest_id, pp.lead_interest_id),
      lead_source_id = coalesce(r.lead_source_id, pp.lead_source_id),
      property_category_id = coalesce(r.property_category_id, pp.property_category_id),
      business_line_id = coalesce(r.business_line_id, pp.business_line_id)
    from public.property_proposals pp
    where r.origin_type = 'property_proposal'
      and r.origin_id = pp.id
      and (
        r.lead_id is null
        or r.lead_type_id is null
        or r.lead_interest_id is null
        or r.lead_source_id is null
        or r.property_category_id is null
        or r.business_line_id is null
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.receivables') is not null
     and to_regclass('public.property_proposals') is not null
     and to_regclass('public.property_proposal_payments') is not null then
    -- Origin: property_proposal_payment
    update public.receivables r
    set
      lead_id = coalesce(r.lead_id, pp.lead_id),
      lead_type_id = coalesce(r.lead_type_id, pp.lead_type_id),
      lead_interest_id = coalesce(r.lead_interest_id, pp.lead_interest_id),
      lead_source_id = coalesce(r.lead_source_id, pp.lead_source_id),
      property_category_id = coalesce(r.property_category_id, pp.property_category_id),
      business_line_id = coalesce(r.business_line_id, pp.business_line_id)
    from public.property_proposal_payments ppp
    join public.property_proposals pp
      on pp.id = ppp.proposal_id
    where r.origin_type = 'property_proposal_payment'
      and r.origin_id = ppp.id
      and (
        r.lead_id is null
        or r.lead_type_id is null
        or r.lead_interest_id is null
        or r.lead_source_id is null
        or r.property_category_id is null
        or r.business_line_id is null
      );
  end if;
end $$;

