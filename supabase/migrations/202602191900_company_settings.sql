begin;

-- ============================================================
-- Cadastro da Empresa (fonte de verdade para documentos)
-- ============================================================

-- Fallback: trigger helper (caso migration do ZapSign ainda nao tenha rodado)
do $$
begin
  if to_regproc('public.docs_set_updated_at') is null then
    execute $fn$
      create function public.docs_set_updated_at()
      returns trigger
      language plpgsql
      as $body$
      begin
        new.updated_at := now();
        return new;
      end;
      $body$;
    $fn$;
  end if;
end $$;

-- Fallback: helper de role (admin/gestor ativo)
do $$
begin
  if to_regproc('public.docs_is_admin_or_gestor_active') is null then
    execute $fn$
      create function public.docs_is_admin_or_gestor_active()
      returns boolean
      language sql
      security definer
      set search_path = public
      stable
      as $body$
        select exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.is_active = true
            and pr.role in ('admin', 'gestor')
        );
      $body$;
    $fn$;
  end if;
end $$;

grant execute on function public.docs_is_admin_or_gestor_active() to authenticated;

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text null,
  cnpj text not null unique,
  state_registration text null,
  municipal_registration text null,
  creci_company text null,
  email text null,
  phone text null,
  address_street text null,
  address_number text null,
  address_complement text null,
  address_neighborhood text null,
  address_city text null,
  address_state text null,
  address_zip text null,
  website text null,
  default_forum_city text not null default 'Lucas do Rio Verde',
  default_forum_state text not null default 'MT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Single-row guard
create unique index if not exists company_settings_singleton_idx
  on public.company_settings ((true));

drop trigger if exists trg_company_settings_updated_at on public.company_settings;
create trigger trg_company_settings_updated_at
before update on public.company_settings
for each row execute function public.docs_set_updated_at();

alter table public.company_settings enable row level security;

drop policy if exists company_settings_select_manager on public.company_settings;
create policy company_settings_select_manager
on public.company_settings
for select
to authenticated
using (public.docs_is_admin_or_gestor_active());

drop policy if exists company_settings_insert_manager on public.company_settings;
create policy company_settings_insert_manager
on public.company_settings
for insert
to authenticated
with check (public.docs_is_admin_or_gestor_active());

drop policy if exists company_settings_update_manager on public.company_settings;
create policy company_settings_update_manager
on public.company_settings
for update
to authenticated
using (public.docs_is_admin_or_gestor_active())
with check (public.docs_is_admin_or_gestor_active());

drop policy if exists company_settings_delete_manager on public.company_settings;
create policy company_settings_delete_manager
on public.company_settings
for delete
to authenticated
using (public.docs_is_admin_or_gestor_active());

grant select, insert, update, delete on public.company_settings to authenticated;

-- Seed inicial (upsert)
do $$
declare
  v_id uuid;
begin
  select id
    into v_id
  from public.company_settings
  where cnpj = '61.366.091/0001-78'
  limit 1;

  if v_id is null then
    select id
      into v_id
    from public.company_settings
    order by created_at asc
    limit 1;
  end if;

  if v_id is null then
    insert into public.company_settings (
      legal_name,
      trade_name,
      cnpj,
      state_registration,
      municipal_registration,
      creci_company,
      email,
      phone,
      address_street,
      address_number,
      address_complement,
      address_neighborhood,
      address_city,
      address_state,
      address_zip,
      website,
      default_forum_city,
      default_forum_state
    ) values (
      'JOAO VICTOR BALBO GENTILINI LTDA',
      null,
      '61.366.091/0001-78',
      null,
      null,
      null,
      'JAOBALBO@ICLOUD.COM',
      '(66) 9253-3011',
      'R DOS GIRASSOIS',
      '1401',
      'W',
      'Parque das Emas',
      'Lucas do Rio Verde',
      'MT',
      '78466-592',
      null,
      'Lucas do Rio Verde',
      'MT'
    );
  else
    update public.company_settings
       set legal_name = 'JOAO VICTOR BALBO GENTILINI LTDA',
           trade_name = null,
           cnpj = '61.366.091/0001-78',
           state_registration = null,
           municipal_registration = null,
           creci_company = null,
           email = 'JAOBALBO@ICLOUD.COM',
           phone = '(66) 9253-3011',
           address_street = 'R DOS GIRASSOIS',
           address_number = '1401',
           address_complement = 'W',
           address_neighborhood = 'Parque das Emas',
           address_city = 'Lucas do Rio Verde',
           address_state = 'MT',
           address_zip = '78466-592',
           website = null,
           default_forum_city = 'Lucas do Rio Verde',
           default_forum_state = 'MT'
     where id = v_id;
  end if;
end $$;

comment on table public.company_settings is 'Cadastro unico da empresa usado em documentos e cabecalho/rodape institucional.';

commit;
