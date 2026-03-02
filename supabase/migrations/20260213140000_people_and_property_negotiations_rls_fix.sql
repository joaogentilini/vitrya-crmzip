begin;

-- ============================================================
-- Helpers de permissao (admin/gestor ativos + owner do imovel)
-- ============================================================
create or replace function public.is_admin_or_gestor_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active = true
      and pr.role in ('admin', 'gestor')
  );
$$;

grant execute on function public.is_admin_or_gestor_active() to authenticated;

create or replace function public.can_manage_property(_property_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = _property_id
      and (
        p.owner_user_id = auth.uid()
        or public.is_admin_or_gestor_active()
      )
  );
$$;

grant execute on function public.can_manage_property(uuid) to authenticated;

-- ============================================================
-- PEOPLE: default/trigger + insert policy consistente
-- ============================================================
do $$
declare
  has_owner_profile boolean;
  has_created_by_profile boolean;
  has_owner_user boolean;
  owner_profile_generated boolean := false;
  created_by_generated boolean := false;
  owner_user_generated boolean := false;
  can_set_owner_profile boolean := false;
  can_set_created_by boolean := false;
  can_set_owner_user boolean := false;
begin
  if to_regclass('public.people') is null then
    raise notice '[202602131400] tabela public.people inexistente - skip';
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'owner_profile_id'
  ) into has_owner_profile;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'created_by_profile_id'
  ) into has_created_by_profile;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'owner_user_id'
  ) into has_owner_user;

  if has_owner_profile then
    select coalesce(is_generated, 'NEVER') = 'ALWAYS'
    into owner_profile_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'owner_profile_id';
  end if;

  if has_created_by_profile then
    select coalesce(is_generated, 'NEVER') = 'ALWAYS'
    into created_by_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'created_by_profile_id';
  end if;

  if has_owner_user then
    select coalesce(is_generated, 'NEVER') = 'ALWAYS'
    into owner_user_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'owner_user_id';
  end if;

  can_set_owner_profile := has_owner_profile and not owner_profile_generated;
  can_set_created_by := has_created_by_profile and not created_by_generated;
  can_set_owner_user := has_owner_user and not owner_user_generated;

  if can_set_created_by then
    execute 'alter table public.people alter column created_by_profile_id set default auth.uid()';
  end if;

  if can_set_owner_profile then
    execute 'alter table public.people alter column owner_profile_id set default auth.uid()';
  end if;

  if can_set_owner_user then
    execute 'alter table public.people alter column owner_user_id set default auth.uid()';
  end if;

  if can_set_owner_profile and can_set_created_by then
    execute $sql$
      create or replace function public.people_autofill_owner_and_creator()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        if new.created_by_profile_id is null and auth.uid() is not null then
          new.created_by_profile_id := auth.uid();
        end if;

        if new.owner_profile_id is null then
          new.owner_profile_id := coalesce(new.created_by_profile_id, auth.uid());
        end if;

        return new;
      end;
      $fn$;
    $sql$;
  elsif can_set_created_by then
    execute $sql$
      create or replace function public.people_autofill_owner_and_creator()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        if new.created_by_profile_id is null and auth.uid() is not null then
          new.created_by_profile_id := auth.uid();
        end if;
        return new;
      end;
      $fn$;
    $sql$;
  elsif can_set_owner_profile then
    execute $sql$
      create or replace function public.people_autofill_owner_and_creator()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        if new.owner_profile_id is null and auth.uid() is not null then
          new.owner_profile_id := auth.uid();
        end if;
        return new;
      end;
      $fn$;
    $sql$;
  elsif can_set_owner_user then
    execute $sql$
      create or replace function public.people_autofill_owner_and_creator()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        if new.owner_user_id is null and auth.uid() is not null then
          new.owner_user_id := auth.uid();
        end if;
        return new;
      end;
      $fn$;
    $sql$;
  end if;

  execute 'drop trigger if exists trg_people_autofill_owner_and_creator on public.people';
  if can_set_owner_profile or can_set_created_by or can_set_owner_user then
    execute 'create trigger trg_people_autofill_owner_and_creator before insert on public.people for each row execute function public.people_autofill_owner_and_creator()';
  end if;

  execute 'drop policy if exists "people_insert" on public.people';
  execute 'drop policy if exists "people_insert_authenticated" on public.people';

  if has_created_by_profile and not created_by_generated and has_owner_profile and not owner_profile_generated then
    execute $sql$
      create policy "people_insert"
      on public.people
      for insert
      to authenticated
      with check (
        auth.uid() is not null
        and created_by_profile_id = auth.uid()
        and (
          owner_profile_id = auth.uid()
          or public.is_admin_or_gestor_active()
        )
      );
    $sql$;
  elsif has_created_by_profile and not created_by_generated then
    execute $sql$
      create policy "people_insert"
      on public.people
      for insert
      to authenticated
      with check (
        auth.uid() is not null
        and created_by_profile_id = auth.uid()
      );
    $sql$;
  elsif has_owner_profile and not owner_profile_generated then
    execute $sql$
      create policy "people_insert"
      on public.people
      for insert
      to authenticated
      with check (
        auth.uid() is not null
        and (
          owner_profile_id = auth.uid()
          or public.is_admin_or_gestor_active()
        )
      );
    $sql$;
  elsif has_owner_user and not owner_user_generated then
    execute $sql$
      create policy "people_insert"
      on public.people
      for insert
      to authenticated
      with check (
        auth.uid() is not null
        and (
          owner_user_id = auth.uid()
          or public.is_admin_or_gestor_active()
        )
      );
    $sql$;
  else
    execute $sql$
      create policy "people_insert"
      on public.people
      for insert
      to authenticated
      with check (auth.uid() is not null);
    $sql$;
  end if;
end $$;

-- ============================================================
-- PROPERTY_NEGOTIATIONS: RLS + autofill ownership/creator
-- ============================================================
do $$
declare
  has_property_id boolean;
  has_owner_user boolean;
  has_created_by_profile boolean;
  owner_user_generated boolean := false;
  created_by_generated boolean := false;
  can_set_owner_user boolean := false;
  can_set_created_by boolean := false;
  pol record;
begin
  if to_regclass('public.property_negotiations') is null then
    raise notice '[202602131400] tabela public.property_negotiations inexistente - skip';
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'property_negotiations'
      and column_name = 'property_id'
  ) into has_property_id;

  if not has_property_id then
    raise notice '[202602131400] coluna property_id ausente em public.property_negotiations - skip';
    return;
  end if;

  execute 'alter table public.property_negotiations enable row level security';

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'property_negotiations'
      and column_name = 'owner_user_id'
  ) into has_owner_user;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'property_negotiations'
      and column_name = 'created_by_profile_id'
  ) into has_created_by_profile;

  if has_owner_user then
    select coalesce(is_generated, 'NEVER') = 'ALWAYS'
    into owner_user_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'property_negotiations'
      and column_name = 'owner_user_id';
  end if;

  if has_created_by_profile then
    select coalesce(is_generated, 'NEVER') = 'ALWAYS'
    into created_by_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'property_negotiations'
      and column_name = 'created_by_profile_id';
  end if;

  can_set_owner_user := has_owner_user and not owner_user_generated;
  can_set_created_by := has_created_by_profile and not created_by_generated;

  if can_set_owner_user then
    execute 'alter table public.property_negotiations alter column owner_user_id set default auth.uid()';
  end if;

  if can_set_created_by then
    execute 'alter table public.property_negotiations alter column created_by_profile_id set default auth.uid()';
  end if;

  if can_set_owner_user and can_set_created_by then
    execute $sql$
      create or replace function public.property_negotiations_autofill_actor()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        if new.owner_user_id is null and auth.uid() is not null then
          new.owner_user_id := auth.uid();
        end if;

        if new.created_by_profile_id is null and auth.uid() is not null then
          new.created_by_profile_id := auth.uid();
        end if;

        return new;
      end;
      $fn$;
    $sql$;
  elsif can_set_owner_user then
    execute $sql$
      create or replace function public.property_negotiations_autofill_actor()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        if new.owner_user_id is null and auth.uid() is not null then
          new.owner_user_id := auth.uid();
        end if;
        return new;
      end;
      $fn$;
    $sql$;
  elsif can_set_created_by then
    execute $sql$
      create or replace function public.property_negotiations_autofill_actor()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        if new.created_by_profile_id is null and auth.uid() is not null then
          new.created_by_profile_id := auth.uid();
        end if;
        return new;
      end;
      $fn$;
    $sql$;
  end if;

  execute 'drop trigger if exists trg_property_negotiations_autofill_actor on public.property_negotiations';
  if can_set_owner_user or can_set_created_by then
    execute 'create trigger trg_property_negotiations_autofill_actor before insert on public.property_negotiations for each row execute function public.property_negotiations_autofill_actor()';
  end if;

  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'property_negotiations'
  loop
    execute format('drop policy if exists %I on public.property_negotiations', pol.policyname);
  end loop;

  execute $sql$
    create policy property_negotiations_select
    on public.property_negotiations
    for select
    to authenticated
    using (public.can_manage_property(property_id));
  $sql$;

  execute $sql$
    create policy property_negotiations_insert
    on public.property_negotiations
    for insert
    to authenticated
    with check (public.can_manage_property(property_id));
  $sql$;

  execute $sql$
    create policy property_negotiations_update
    on public.property_negotiations
    for update
    to authenticated
    using (public.can_manage_property(property_id))
    with check (public.can_manage_property(property_id));
  $sql$;

  execute $sql$
    create policy property_negotiations_delete
    on public.property_negotiations
    for delete
    to authenticated
    using (public.can_manage_property(property_id));
  $sql$;
end $$;

commit;
