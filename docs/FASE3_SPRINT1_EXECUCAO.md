# FASE 3 - SPRINT 1 (CHAT INBOX FOUNDATION)

Data: 2026-03-03

## 1. Objetivo

Entregar a base operacional do chat unificado dentro do CRM:
1. schema de inbox no banco (conversas, mensagens, labels, respostas rapidas, regras e bots),
2. entrada automatica de mensagens de portais no inbox,
3. inbox interno no CRM para leitura e resposta,
4. webhook de WhatsApp preparado para ingestao inbound.

## 2. Entregas aplicadas

1. Migration de fundacao do inbox:
   - `supabase/migrations/202603032030_chat_inbox_foundation.sql`
2. Biblioteca server-side do chat:
   - `lib/chat/inbox.ts`
3. Integracao com ingestao de portais:
   - `lib/integrations/portals/leadIngestion.ts`
   - Ao receber lead de portal, agora cria/atualiza conversa + mensagem inbound no inbox.
4. Webhook WhatsApp inbound:
   - `app/api/integrations/whatsapp/webhook/route.ts`
   - Suporte a verificacao GET (`hub.challenge`) e ingestao POST.
5. Inbox CRM:
   - `app/(crm)/inbox/page.tsx`
   - `app/(crm)/inbox/actions.ts`
6. Navegacao:
   - menu lateral com item `Inbox` no CRM (`components/layout/AppShell.tsx`).

## 3. Banco (status)

Migration aplicada no remoto:
1. `202603032030_chat_inbox_foundation.sql` (Local=Remote confirmado via `supabase migration list`).

## 4. Escopo funcional desta entrega

1. Conversas unificadas por canal:
   - `whatsapp`, `instagram`, `facebook`, `olx`, `grupoolx`, `meta`, `other`.
2. Mensagens inbound e outbound registradas com historico.
3. RLS aplicado para:
   - corretor dono da conversa,
   - admin/gestor com visao gerencial.
4. Atualizacao de status da conversa:
   - `open`, `pending`, `resolved`, `archived`.
5. Composer interno no CRM (registro outbound no historico).

## 5. Proximos passos naturais (Sprint 2)

1. Integrar Instagram/Facebook Graph no mesmo pipeline de conversa.
2. Conectar envio outbound real por canal (WhatsApp Cloud/Evolution).
3. Realtime no Inbox (Supabase Realtime para refresh sem reload).
4. Automacoes IA de qualificacao e follow-up com base em `chat_automation_rules`.
