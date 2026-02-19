begin;

alter table public.profiles
  add column if not exists broker_commission_level text,
  add column if not exists broker_commission_percent numeric(7,4) not null default 50,
  add column if not exists company_commission_percent numeric(7,4) not null default 50,
  add column if not exists partner_commission_percent numeric(7,4) not null default 0;

update public.profiles
set
  broker_commission_percent = coalesce(broker_commission_percent, 50),
  company_commission_percent = coalesce(company_commission_percent, 50),
  partner_commission_percent = coalesce(partner_commission_percent, 0)
where
  broker_commission_percent is null
  or company_commission_percent is null
  or partner_commission_percent is null;

alter table public.profiles
  alter column broker_commission_percent set not null,
  alter column company_commission_percent set not null,
  alter column partner_commission_percent set not null;

alter table public.profiles
  drop constraint if exists profiles_broker_commission_percent_check,
  drop constraint if exists profiles_company_commission_percent_check,
  drop constraint if exists profiles_partner_commission_percent_check,
  drop constraint if exists profiles_commission_percent_total_check;

alter table public.profiles
  add constraint profiles_broker_commission_percent_check
    check (broker_commission_percent >= 0 and broker_commission_percent <= 100),
  add constraint profiles_company_commission_percent_check
    check (company_commission_percent >= 0 and company_commission_percent <= 100),
  add constraint profiles_partner_commission_percent_check
    check (partner_commission_percent >= 0 and partner_commission_percent <= 100),
  add constraint profiles_commission_percent_total_check
    check (abs((broker_commission_percent + company_commission_percent + partner_commission_percent) - 100) <= 0.0001);

alter table public.property_proposals
  add column if not exists commission_partner_type text not null default 'none';

alter table public.property_proposals
  drop constraint if exists property_proposals_commission_partner_type_check;

alter table public.property_proposals
  add constraint property_proposals_commission_partner_type_check
    check (commission_partner_type in ('none', 'internal', 'external'));

commit;
