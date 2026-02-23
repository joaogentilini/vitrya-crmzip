-- Stage 0: RLS/policies para proposal_payment_methods e collection_methods
-- Idempotente

create or replace function public.fin_is_admin_or_gestor_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin', 'gestor')
  );
$$;

grant execute on function public.fin_is_admin_or_gestor_active() to authenticated;

do $$
begin
  if to_regclass('public.proposal_payment_methods') is not null then
    alter table public.proposal_payment_methods enable row level security;
  end if;

  if to_regclass('public.collection_methods') is not null then
    alter table public.collection_methods enable row level security;
  end if;
end $$;

drop policy if exists proposal_payment_methods_manager_all on public.proposal_payment_methods;
create policy proposal_payment_methods_manager_all
on public.proposal_payment_methods
for all
to authenticated
using (public.fin_is_admin_or_gestor_active())
with check (public.fin_is_admin_or_gestor_active());

drop policy if exists collection_methods_manager_all on public.collection_methods;
create policy collection_methods_manager_all
on public.collection_methods
for all
to authenticated
using (public.fin_is_admin_or_gestor_active())
with check (public.fin_is_admin_or_gestor_active());

grant select, insert, update, delete on public.proposal_payment_methods to authenticated;
grant select, insert, update, delete on public.collection_methods to authenticated;

