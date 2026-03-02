-- Stage 0 hotfix: garantir colunas de rastreabilidade que podem ter ficado faltando
-- Idempotente e seguro para ambientes parcialmente migrados

do $$
begin
  if to_regclass('public.property_proposals') is not null then
    alter table public.property_proposals
      add column if not exists property_category_id uuid null references public.property_categories(id) on delete set null;
  end if;

  if to_regclass('public.receivables') is not null then
    alter table public.receivables
      add column if not exists lead_interest_id uuid null references public.lead_interests(id) on delete set null;
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
         and indexname = 'property_proposals_property_category_idx_hotfix'
     ) then
    execute 'create index property_proposals_property_category_idx_hotfix on public.property_proposals(property_category_id)';
  end if;

  if to_regclass('public.receivables') is not null
     and not exists (
       select 1
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'receivables'
         and indexname = 'receivables_lead_interest_idx_hotfix'
     ) then
    execute 'create index receivables_lead_interest_idx_hotfix on public.receivables(lead_interest_id)';
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
  end if;
end $$;

do $$
begin
  if to_regclass('public.property_proposals') is not null and to_regclass('public.leads') is not null then
    update public.property_proposals pp
    set lead_interest_id = l.lead_interest_id
    from public.leads l
    where pp.lead_id = l.id
      and pp.lead_interest_id is null
      and l.lead_interest_id is not null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.receivables') is not null and to_regclass('public.property_proposals') is not null then
    update public.receivables r
    set
      lead_interest_id = coalesce(r.lead_interest_id, pp.lead_interest_id),
      property_category_id = coalesce(r.property_category_id, pp.property_category_id)
    from public.property_proposals pp
    where r.origin_type = 'property_proposal'
      and r.origin_id = pp.id
      and (r.lead_interest_id is null or r.property_category_id is null);
  end if;
end $$;

do $$
begin
  if to_regclass('public.receivables') is not null
     and to_regclass('public.property_proposals') is not null
     and to_regclass('public.property_proposal_payments') is not null then
    update public.receivables r
    set
      lead_interest_id = coalesce(r.lead_interest_id, pp.lead_interest_id),
      property_category_id = coalesce(r.property_category_id, pp.property_category_id)
    from public.property_proposal_payments ppp
    join public.property_proposals pp on pp.id = ppp.proposal_id
    where r.origin_type = 'property_proposal_payment'
      and r.origin_id = ppp.id
      and (r.lead_interest_id is null or r.property_category_id is null);
  end if;
end $$;
