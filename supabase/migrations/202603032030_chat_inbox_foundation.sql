begin;

-- ============================================================
-- Fase 3 / Sprint 1 - Chat Inbox Foundation
-- ============================================================

create or replace function public.chat_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.chat_is_admin_or_gestor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin', 'gestor')
  );
$$;

grant execute on function public.chat_is_admin_or_gestor() to authenticated;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null
    check (channel in ('whatsapp', 'instagram', 'facebook', 'olx', 'grupoolx', 'meta', 'other')),
  external_conversation_id text null,
  external_lead_id text null,
  broker_user_id uuid null references public.profiles(id) on delete set null,
  lead_id uuid null references public.leads(id) on delete set null,
  person_id uuid null references public.people(id) on delete set null,
  property_id uuid null references public.properties(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'pending', 'resolved', 'archived')),
  subject text null,
  last_message_at timestamptz null,
  last_message_preview text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_conversations_channel_external_uidx
  on public.chat_conversations (channel, external_conversation_id)
  where external_conversation_id is not null;

create index if not exists chat_conversations_broker_status_last_message_idx
  on public.chat_conversations (broker_user_id, status, last_message_at desc nulls last);

create index if not exists chat_conversations_lead_idx
  on public.chat_conversations (lead_id, updated_at desc);

create index if not exists chat_conversations_property_idx
  on public.chat_conversations (property_id, updated_at desc);

drop trigger if exists trg_chat_conversations_updated_at on public.chat_conversations;
create trigger trg_chat_conversations_updated_at
before update on public.chat_conversations
for each row execute function public.chat_set_updated_at();

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  direction text not null
    check (direction in ('inbound', 'outbound', 'system')),
  channel text not null
    check (channel in ('whatsapp', 'instagram', 'facebook', 'olx', 'grupoolx', 'meta', 'other')),
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'audio', 'video', 'document', 'template', 'event')),
  content_text text null,
  media_url text null,
  provider_message_id text null,
  sender_name text null,
  sender_external_id text null,
  status text not null default 'received'
    check (status in ('queued', 'received', 'sent', 'delivered', 'read', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by_profile_id uuid null references public.profiles(id) on delete set null
);

create unique index if not exists chat_messages_conversation_provider_message_uidx
  on public.chat_messages (conversation_id, provider_message_id)
  where provider_message_id is not null;

create index if not exists chat_messages_conversation_occurred_idx
  on public.chat_messages (conversation_id, occurred_at desc);

create index if not exists chat_messages_status_occurred_idx
  on public.chat_messages (status, occurred_at desc);

create table if not exists public.chat_conversation_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color_hex text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_chat_conversation_labels_updated_at on public.chat_conversation_labels;
create trigger trg_chat_conversation_labels_updated_at
before update on public.chat_conversation_labels
for each row execute function public.chat_set_updated_at();

create table if not exists public.chat_conversation_label_links (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  label_id uuid not null references public.chat_conversation_labels(id) on delete cascade,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists chat_conversation_label_links_uidx
  on public.chat_conversation_label_links (conversation_id, label_id);

create index if not exists chat_conversation_label_links_label_idx
  on public.chat_conversation_label_links (label_id, created_at desc);

create table if not exists public.chat_quick_replies (
  id uuid primary key default gen_random_uuid(),
  broker_user_id uuid null references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  is_shared boolean not null default false,
  is_active boolean not null default true,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_quick_replies_broker_shared_idx
  on public.chat_quick_replies (broker_user_id, is_shared, is_active, updated_at desc);

drop trigger if exists trg_chat_quick_replies_updated_at on public.chat_quick_replies;
create trigger trg_chat_quick_replies_updated_at
before update on public.chat_quick_replies
for each row execute function public.chat_set_updated_at();

create table if not exists public.chat_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  channel text null
    check (channel is null or channel in ('whatsapp', 'instagram', 'facebook', 'olx', 'grupoolx', 'meta', 'other')),
  trigger_event text not null default 'no_response',
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_automation_rules_active_channel_idx
  on public.chat_automation_rules (is_active, channel, updated_at desc);

drop trigger if exists trg_chat_automation_rules_updated_at on public.chat_automation_rules;
create trigger trg_chat_automation_rules_updated_at
before update on public.chat_automation_rules
for each row execute function public.chat_set_updated_at();

create table if not exists public.chat_bots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text null
    check (channel is null or channel in ('whatsapp', 'instagram', 'facebook', 'olx', 'grupoolx', 'meta', 'other')),
  system_prompt text not null,
  qualification_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_bots_active_channel_idx
  on public.chat_bots (is_active, channel, updated_at desc);

drop trigger if exists trg_chat_bots_updated_at on public.chat_bots;
create trigger trg_chat_bots_updated_at
before update on public.chat_bots
for each row execute function public.chat_set_updated_at();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_conversation_labels enable row level security;
alter table public.chat_conversation_label_links enable row level security;
alter table public.chat_quick_replies enable row level security;
alter table public.chat_automation_rules enable row level security;
alter table public.chat_bots enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select
on public.chat_conversations
for select
to authenticated
using (
  broker_user_id = auth.uid()
  or public.chat_is_admin_or_gestor()
);

drop policy if exists chat_conversations_insert on public.chat_conversations;
create policy chat_conversations_insert
on public.chat_conversations
for insert
to authenticated
with check (
  broker_user_id is null
  or broker_user_id = auth.uid()
  or public.chat_is_admin_or_gestor()
);

drop policy if exists chat_conversations_update on public.chat_conversations;
create policy chat_conversations_update
on public.chat_conversations
for update
to authenticated
using (
  broker_user_id = auth.uid()
  or public.chat_is_admin_or_gestor()
)
with check (
  broker_user_id is null
  or broker_user_id = auth.uid()
  or public.chat_is_admin_or_gestor()
);

drop policy if exists chat_conversations_delete on public.chat_conversations;
create policy chat_conversations_delete
on public.chat_conversations
for delete
to authenticated
using (public.chat_is_admin_or_gestor());

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = chat_messages.conversation_id
      and (c.broker_user_id = auth.uid() or public.chat_is_admin_or_gestor())
  )
);

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert
on public.chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = chat_messages.conversation_id
      and (
        c.broker_user_id = auth.uid()
        or public.chat_is_admin_or_gestor()
      )
  )
);

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update
on public.chat_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = chat_messages.conversation_id
      and (c.broker_user_id = auth.uid() or public.chat_is_admin_or_gestor())
  )
)
with check (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = chat_messages.conversation_id
      and (c.broker_user_id = auth.uid() or public.chat_is_admin_or_gestor())
  )
);

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete
on public.chat_messages
for delete
to authenticated
using (public.chat_is_admin_or_gestor());

drop policy if exists chat_conversation_labels_select on public.chat_conversation_labels;
create policy chat_conversation_labels_select
on public.chat_conversation_labels
for select
to authenticated
using (true);

drop policy if exists chat_conversation_labels_insert on public.chat_conversation_labels;
create policy chat_conversation_labels_insert
on public.chat_conversation_labels
for insert
to authenticated
with check (public.chat_is_admin_or_gestor());

drop policy if exists chat_conversation_labels_update on public.chat_conversation_labels;
create policy chat_conversation_labels_update
on public.chat_conversation_labels
for update
to authenticated
using (public.chat_is_admin_or_gestor())
with check (public.chat_is_admin_or_gestor());

drop policy if exists chat_conversation_labels_delete on public.chat_conversation_labels;
create policy chat_conversation_labels_delete
on public.chat_conversation_labels
for delete
to authenticated
using (public.chat_is_admin_or_gestor());

drop policy if exists chat_conversation_label_links_select on public.chat_conversation_label_links;
create policy chat_conversation_label_links_select
on public.chat_conversation_label_links
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = chat_conversation_label_links.conversation_id
      and (c.broker_user_id = auth.uid() or public.chat_is_admin_or_gestor())
  )
);

drop policy if exists chat_conversation_label_links_insert on public.chat_conversation_label_links;
create policy chat_conversation_label_links_insert
on public.chat_conversation_label_links
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = chat_conversation_label_links.conversation_id
      and (c.broker_user_id = auth.uid() or public.chat_is_admin_or_gestor())
  )
);

drop policy if exists chat_conversation_label_links_delete on public.chat_conversation_label_links;
create policy chat_conversation_label_links_delete
on public.chat_conversation_label_links
for delete
to authenticated
using (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = chat_conversation_label_links.conversation_id
      and (c.broker_user_id = auth.uid() or public.chat_is_admin_or_gestor())
  )
);

drop policy if exists chat_quick_replies_select on public.chat_quick_replies;
create policy chat_quick_replies_select
on public.chat_quick_replies
for select
to authenticated
using (
  is_shared = true
  or broker_user_id = auth.uid()
  or created_by_profile_id = auth.uid()
  or public.chat_is_admin_or_gestor()
);

drop policy if exists chat_quick_replies_insert on public.chat_quick_replies;
create policy chat_quick_replies_insert
on public.chat_quick_replies
for insert
to authenticated
with check (
  created_by_profile_id = auth.uid()
  or public.chat_is_admin_or_gestor()
);

drop policy if exists chat_quick_replies_update on public.chat_quick_replies;
create policy chat_quick_replies_update
on public.chat_quick_replies
for update
to authenticated
using (
  created_by_profile_id = auth.uid()
  or public.chat_is_admin_or_gestor()
)
with check (
  created_by_profile_id = auth.uid()
  or public.chat_is_admin_or_gestor()
);

drop policy if exists chat_quick_replies_delete on public.chat_quick_replies;
create policy chat_quick_replies_delete
on public.chat_quick_replies
for delete
to authenticated
using (
  created_by_profile_id = auth.uid()
  or public.chat_is_admin_or_gestor()
);

drop policy if exists chat_automation_rules_select on public.chat_automation_rules;
create policy chat_automation_rules_select
on public.chat_automation_rules
for select
to authenticated
using (public.chat_is_admin_or_gestor());

drop policy if exists chat_automation_rules_insert on public.chat_automation_rules;
create policy chat_automation_rules_insert
on public.chat_automation_rules
for insert
to authenticated
with check (public.chat_is_admin_or_gestor());

drop policy if exists chat_automation_rules_update on public.chat_automation_rules;
create policy chat_automation_rules_update
on public.chat_automation_rules
for update
to authenticated
using (public.chat_is_admin_or_gestor())
with check (public.chat_is_admin_or_gestor());

drop policy if exists chat_automation_rules_delete on public.chat_automation_rules;
create policy chat_automation_rules_delete
on public.chat_automation_rules
for delete
to authenticated
using (public.chat_is_admin_or_gestor());

drop policy if exists chat_bots_select on public.chat_bots;
create policy chat_bots_select
on public.chat_bots
for select
to authenticated
using (public.chat_is_admin_or_gestor());

drop policy if exists chat_bots_insert on public.chat_bots;
create policy chat_bots_insert
on public.chat_bots
for insert
to authenticated
with check (public.chat_is_admin_or_gestor());

drop policy if exists chat_bots_update on public.chat_bots;
create policy chat_bots_update
on public.chat_bots
for update
to authenticated
using (public.chat_is_admin_or_gestor())
with check (public.chat_is_admin_or_gestor());

drop policy if exists chat_bots_delete on public.chat_bots;
create policy chat_bots_delete
on public.chat_bots
for delete
to authenticated
using (public.chat_is_admin_or_gestor());

grant select, insert, update, delete on public.chat_conversations to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant select, insert, update, delete on public.chat_conversation_labels to authenticated;
grant select, insert, update, delete on public.chat_conversation_label_links to authenticated;
grant select, insert, update, delete on public.chat_quick_replies to authenticated;
grant select, insert, update, delete on public.chat_automation_rules to authenticated;
grant select, insert, update, delete on public.chat_bots to authenticated;

insert into public.chat_conversation_labels (name, color_hex, is_active)
values
  ('Qualificado', '#16A34A', true),
  ('Urgente', '#DC2626', true),
  ('Aguardando retorno', '#D97706', true),
  ('Sem resposta', '#6B7280', true)
on conflict (name) do nothing;

comment on table public.chat_conversations is 'Inbox unificado por corretor/canal (fase 3).';
comment on table public.chat_messages is 'Mensagens inbound/outbound vinculadas a conversas do inbox.';
comment on table public.chat_conversation_labels is 'Etiquetas de organizacao para conversas.';
comment on table public.chat_conversation_label_links is 'Vinculo n:n entre conversas e etiquetas.';
comment on table public.chat_quick_replies is 'Respostas rapidas por corretor/gestor.';
comment on table public.chat_automation_rules is 'Regras de automacao de atendimento/follow-up do inbox.';
comment on table public.chat_bots is 'Configuracao de bots de qualificacao por canal/contexto.';

commit;
