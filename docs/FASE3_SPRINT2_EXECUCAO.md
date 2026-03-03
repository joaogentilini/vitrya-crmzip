# FASE 3 - SPRINT 2 (INBOX MULTICANAL META)

Data: 2026-03-03

## 1. Objetivo

Integrar Instagram e Facebook ao mesmo pipeline do Inbox unificado, com:
1. webhook de entrada para Graph API,
2. verificacao de assinatura HMAC da Meta,
3. roteamento de ownership por conta/canal (page/account -> corretor),
4. persistencia no `chat_conversations` + `chat_messages`.

## 2. Entregas aplicadas

1. Endpoint Meta webhook:
   - `app/api/integrations/meta/webhook/route.ts`
2. Migration de roteamento por conta/canal:
   - `supabase/migrations/202603032250_chat_channel_accounts_routing.sql`
3. Documentacao de deploy atualizada:
   - `docs/deploy-easypanel.md` (novas envs Meta)

## 3. Endpoint novo

1. `GET /api/integrations/meta/webhook`
   - Verificacao `hub.challenge` da Meta.
2. `POST /api/integrations/meta/webhook`
   - Processa eventos inbound de `instagram` e `page`.
   - Ignora eventos sem mensagem e `is_echo=true`.
   - Cria/atualiza conversa e grava mensagem inbound no Inbox.

## 4. Seguranca aplicada

1. `META_WEBHOOK_ENABLED`:
   - liga/desliga endpoint (default: ligado se env ausente).
2. `META_WEBHOOK_VERIFY_TOKEN`:
   - obrigatorio para handshake GET.
3. `META_APP_SECRET`:
   - se configurado, valida `x-hub-signature-256` (HMAC SHA-256) no POST.
4. `META_WEBHOOK_TOKEN` (opcional):
   - token adicional por header `x-webhook-token` ou `Bearer`.

## 5. Ownership por corretor

Tabela nova: `public.chat_channel_accounts`

Campos principais:
1. `channel` (`instagram`/`facebook`/etc),
2. `provider_account_id` (id da pagina/conta),
3. `broker_user_id` (corretor dono),
4. `is_active`.

Exemplo de cadastro:

```sql
insert into public.chat_channel_accounts (channel, provider_account_id, account_name, broker_user_id, is_active)
values
  ('instagram', '1784XXXXXXXXXXXX', 'Instagram Imobiliaria', 'UUID_DO_CORRETOR', true),
  ('facebook', '123456789012345', 'Facebook Page Imobiliaria', 'UUID_DO_CORRETOR', true)
on conflict (channel, provider_account_id)
do update set
  account_name = excluded.account_name,
  broker_user_id = excluded.broker_user_id,
  is_active = excluded.is_active,
  updated_at = now();
```

## 6. Comportamento operacional

1. Conversa usa `external_conversation_id` composto por `recipient_account_id:sender_id`.
2. Mensagens entram com canal `instagram` ou `facebook`.
3. Se existir mapeamento em `chat_channel_accounts`, a conversa nasce com `broker_user_id`.
4. Sem mapeamento, a conversa fica sem dono e visivel para admin/gestor.

## 7. Proximo passo natural

1. Tela administrativa para gerir `chat_channel_accounts` no CRM (sem SQL manual).
