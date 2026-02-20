begin;

-- Hotfix: remove dependencia de pgcrypto/gen_random_bytes()
-- Alguns ambientes nao possuem a funcao gen_random_bytes(integer) habilitada.

create or replace function public.generate_verify_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  token text;
begin
  token := lower(
    md5(
      random()::text
      || clock_timestamp()::text
      || txid_current()::text
      || pg_backend_pid()::text
      || coalesce(auth.uid()::text, '')
    )
    || md5(
      random()::text
      || clock_timestamp()::text
      || txid_current()::text
      || pg_backend_pid()::text
      || coalesce(auth.uid()::text, '')
    )
  );

  return token;
end;
$$;

grant execute on function public.generate_verify_token() to authenticated;

create or replace function public.document_instances_set_tracking_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.document_number is null or btrim(new.document_number) = '' then
    new.document_number := public.next_document_number(new.template_code);
  end if;

  if new.verify_token is null or btrim(new.verify_token) = '' then
    new.verify_token := public.generate_verify_token();
  end if;

  return new;
end;
$$;

-- Backfill de registros antigos sem token
do $$
begin
  if to_regclass('public.document_instances') is not null then
    execute $sql$
      update public.document_instances di
         set verify_token = public.generate_verify_token()
       where di.verify_token is null
          or btrim(di.verify_token) = ''
    $sql$;
  end if;
end $$;

commit;

