begin;

create or replace function public.properties_autofill_owner_and_created_by()
returns trigger
language plpgsql
as $$
begin
  -- created_by: sempre quem está logado (se não veio preenchido)
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  -- owner_user_id: se não veio, assume o mesmo do created_by
  if new.owner_user_id is null then
    new.owner_user_id := new.created_by;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_properties_autofill_owner_and_created_by on public.properties;
create trigger trg_properties_autofill_owner_and_created_by
before insert on public.properties
for each row
execute function public.properties_autofill_owner_and_created_by();

commit;
