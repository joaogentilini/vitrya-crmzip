begin;

-- ============================================================
-- Rastreabilidade de documentos:
-- - document_number
-- - verify_token
-- - contador sequencial por template/ano
-- ============================================================

create table if not exists public.document_counters (
  prefix text primary key,
  seq bigint not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.next_document_number(_template_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  template_code text := upper(coalesce(trim(_template_code), 'DOC'));
  short_prefix text;
  year_text text := to_char(now(), 'YYYY');
  counter_key text;
  next_seq bigint;
begin
  short_prefix := case
    when template_code like 'AUT%' then 'AUT'
    when template_code like '%GEST%' then 'GEST'
    when template_code like '%ALUG%' then 'ALUG'
    when template_code like '%VIST%' then 'VIST'
    when template_code like '%CHAV%' or template_code like '%CHV%' then 'CHV'
    when template_code like '%CV%' or template_code like '%COMPRA%' then 'CV'
    else 'DOC'
  end;

  counter_key := short_prefix || '-' || year_text;

  insert into public.document_counters (prefix, seq, updated_at)
  values (counter_key, 1, now())
  on conflict (prefix)
  do update set
    seq = public.document_counters.seq + 1,
    updated_at = now()
  returning seq into next_seq;

  return format('VIT-%s-%s-%s', short_prefix, year_text, lpad(next_seq::text, 5, '0'));
end;
$$;

grant execute on function public.next_document_number(text) to authenticated;

alter table if exists public.document_instances
  add column if not exists document_number text null;

alter table if exists public.document_instances
  add column if not exists verify_token text null;

do $$
begin
  if to_regclass('public.document_instances') is not null then
    execute 'create unique index if not exists document_instances_document_number_uidx on public.document_instances(document_number) where document_number is not null';
    execute 'create unique index if not exists document_instances_verify_token_uidx on public.document_instances(verify_token) where verify_token is not null';
  end if;
end $$;

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

do $$
begin
  if to_regclass('public.document_instances') is not null then
    execute 'drop trigger if exists trg_document_instances_tracking_defaults on public.document_instances';
    execute 'create trigger trg_document_instances_tracking_defaults before insert on public.document_instances for each row execute function public.document_instances_set_tracking_defaults()';
  end if;
end $$;

-- Backfill em registros antigos (sem consumir preview)
do $$
begin
  if to_regclass('public.document_instances') is not null then
    execute $sql$
      update public.document_instances di
         set document_number = public.next_document_number(di.template_code)
       where di.document_number is null
          or btrim(di.document_number) = ''
    $sql$;

    execute $sql$
      update public.document_instances di
         set verify_token = public.generate_verify_token()
       where di.verify_token is null
          or btrim(di.verify_token) = ''
    $sql$;
  end if;
end $$;

comment on column public.document_instances.document_number is 'Numero unico de rastreabilidade exibido no documento.';
comment on column public.document_instances.verify_token is 'Token publico para pagina /verify/<token>.';

commit;
