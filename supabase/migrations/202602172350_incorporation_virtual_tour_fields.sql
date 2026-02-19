begin;

alter table public.incorporations
  add column if not exists virtual_tour_url text null;

alter table public.incorporations
  drop constraint if exists incorporations_virtual_tour_url_check;

alter table public.incorporations
  add constraint incorporations_virtual_tour_url_check
  check (
    virtual_tour_url is null
    or virtual_tour_url ~* '^https?://'
  );

alter table public.incorporation_plans
  add column if not exists virtual_tour_url text null;

alter table public.incorporation_plans
  drop constraint if exists incorporation_plans_virtual_tour_url_check;

alter table public.incorporation_plans
  add constraint incorporation_plans_virtual_tour_url_check
  check (
    virtual_tour_url is null
    or virtual_tour_url ~* '^https?://'
  );

comment on column public.incorporations.virtual_tour_url is
  'URL de tour virtual 360/RV do empreendimento.';

comment on column public.incorporation_plans.virtual_tour_url is
  'URL de tour virtual 360/RV especifico da tipologia/planta.';

commit;
