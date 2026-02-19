-- AI generation logs for property marketing copy

create table if not exists public.property_ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  provider text not null default 'openai'
    check (provider in ('openai', 'webhook', 'fallback')),
  model text,
  portal_profile text not null default 'general'
    check (portal_profile in ('general', 'olx', 'zap', 'vivareal')),
  status text not null
    check (status in ('success', 'fallback', 'error')),
  used_ai boolean not null default false,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  latency_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists property_ai_logs_property_created_idx
  on public.property_ai_generation_logs(property_id, created_at desc);

create index if not exists property_ai_logs_actor_created_idx
  on public.property_ai_generation_logs(actor_id, created_at desc);

create index if not exists property_ai_logs_status_created_idx
  on public.property_ai_generation_logs(status, created_at desc);

alter table public.property_ai_generation_logs enable row level security;

drop policy if exists property_ai_generation_logs_select on public.property_ai_generation_logs;
create policy property_ai_generation_logs_select
on public.property_ai_generation_logs
for select
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_ai_generation_logs.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.role in ('admin', 'gestor')
            and pr.is_active = true
        )
      )
  )
);

drop policy if exists property_ai_generation_logs_insert on public.property_ai_generation_logs;
create policy property_ai_generation_logs_insert
on public.property_ai_generation_logs
for insert
with check (
  actor_id = auth.uid()
  and exists (
    select 1
    from public.properties p
    where p.id = property_ai_generation_logs.property_id
      and (
        p.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.role in ('admin', 'gestor')
            and pr.is_active = true
        )
      )
  )
);

grant select, insert on public.property_ai_generation_logs to authenticated;

comment on table public.property_ai_generation_logs is 'Audit/log of AI generation attempts for property marketing copy.';
