-- Status comercial do imóvel (não confundir com publish status draft/active)
alter table public.properties
add column if not exists deal_status text null,
add column if not exists deal_marked_at timestamptz null,
add column if not exists deal_visible_until timestamptz null;

-- (opcional) check simples
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'properties_deal_status_chk'
  ) then
    alter table public.properties
    add constraint properties_deal_status_chk
    check (deal_status is null or deal_status in ('reserved','sold'));
  end if;
end$$;

-- índice leve (ajuda a vitrine filtrar)
create index if not exists idx_properties_deal_visible_until
on public.properties (deal_visible_until);

create index if not exists idx_properties_deal_status
on public.properties (deal_status);
