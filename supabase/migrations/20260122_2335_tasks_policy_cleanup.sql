begin;

-- Remover policy ampla (perigosa) que usa roles {public} e ALL
drop policy if exists "Tasks access policy" on public.tasks;

-- Garantir que as policies scoped existam (recria de forma idempotente)
drop policy if exists tasks_insert_scoped on public.tasks;
create policy tasks_insert_scoped
on public.tasks
for insert
to authenticated
with check ((assigned_to = auth.uid()) or is_admin());

drop policy if exists tasks_select_scoped on public.tasks;
create policy tasks_select_scoped
on public.tasks
for select
to authenticated
using ((assigned_to = auth.uid()) or is_admin());

drop policy if exists tasks_update_scoped on public.tasks;
create policy tasks_update_scoped
on public.tasks
for update
to authenticated
using ((assigned_to = auth.uid()) or is_admin())
with check ((assigned_to = auth.uid()) or is_admin());

-- (Opcional) Delete: somente admin. Se você não quer delete, nem crie.
drop policy if exists tasks_delete_scoped on public.tasks;
create policy tasks_delete_scoped
on public.tasks
for delete
to authenticated
using (is_admin());

commit;
