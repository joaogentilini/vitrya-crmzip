begin;

alter table public.incorporation_plans
  add column if not exists rooms_count integer null,
  add column if not exists blocks_count integer not null default 1,
  add column if not exists floors_per_block integer not null default 1,
  add column if not exists units_per_floor integer not null default 1,
  add column if not exists block_prefix text null;

alter table public.incorporation_plans
  drop constraint if exists incorporation_plans_rooms_count_check;

alter table public.incorporation_plans
  add constraint incorporation_plans_rooms_count_check
  check (rooms_count is null or rooms_count >= 0);

alter table public.incorporation_plans
  drop constraint if exists incorporation_plans_blocks_count_check;

alter table public.incorporation_plans
  add constraint incorporation_plans_blocks_count_check
  check (blocks_count >= 1 and blocks_count <= 50);

alter table public.incorporation_plans
  drop constraint if exists incorporation_plans_floors_per_block_check;

alter table public.incorporation_plans
  add constraint incorporation_plans_floors_per_block_check
  check (floors_per_block >= 1 and floors_per_block <= 300);

alter table public.incorporation_plans
  drop constraint if exists incorporation_plans_units_per_floor_check;

alter table public.incorporation_plans
  add constraint incorporation_plans_units_per_floor_check
  check (units_per_floor >= 1 and units_per_floor <= 50);

alter table public.incorporation_plans
  drop constraint if exists incorporation_plans_block_prefix_check;

alter table public.incorporation_plans
  add constraint incorporation_plans_block_prefix_check
  check (block_prefix is null or length(trim(block_prefix)) <= 8);

comment on column public.incorporation_plans.rooms_count is 'Quantidade total de comodos da tipologia.';
comment on column public.incorporation_plans.blocks_count is 'Quantidade de blocos/torres para geracao automatica de unidades.';
comment on column public.incorporation_plans.floors_per_block is 'Quantidade de andares por bloco/torre para geracao automatica.';
comment on column public.incorporation_plans.units_per_floor is 'Quantidade de apartamentos por andar para geracao automatica.';
comment on column public.incorporation_plans.block_prefix is 'Prefixo opcional do codigo de unidade durante geracao automatica.';

commit;
