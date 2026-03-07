# OPENCLAW - SETUP E INTEGRACAO COM INBOX

Data: 2026-03-07

## 1. Objetivo

Conectar OpenClaw ao CRM para:

1. receber mensagens inbound no Inbox omnichannel;
2. rotear ownership por conta/canal (`chat_channel_accounts`);
3. enviar mensagens outbound do Inbox via OpenClaw.

## 2. Entregas implementadas

1. Cliente OpenClaw API:
   - `lib/integrations/openclaw/client.ts`
2. Webhook inbound OpenClaw:
   - `app/api/integrations/openclaw/webhook/route.ts`
   - `app/api/integrations/openclaw/webhook/[event]/route.ts`
   - `app/api/integrations/openclaw/webhook/handler.ts`
3. Mapeamento admin de contas OpenClaw:
   - `app/api/admin/integrations/openclaw/route.ts`
4. Outbound Inbox -> OpenClaw:
   - `lib/chat/inbox.ts` (quando a conversa tem `metadata.provider=openclaw` ou `metadata.source=openclaw_webhook`)

## 3. Variaveis de ambiente (CRM)

```env
OPENCLAW_API_ENABLED=1
OPENCLAW_API_BASE_URL=https://api.openclaw.seu-dominio.com
OPENCLAW_API_KEY=troque-para-a-chave-da-openclaw
OPENCLAW_SEND_TEXT_PATH=/messages/send

OPENCLAW_WEBHOOK_ENABLED=1
OPENCLAW_WEBHOOK_TOKEN=troque-este-token-webhook
# Opcional, se OpenClaw assinar payload com HMAC SHA256
OPENCLAW_WEBHOOK_SECRET=troque-este-secret
```

## 4. Endpoint de webhook

1. Endpoint base:
   - `POST /api/integrations/openclaw/webhook`
2. Endpoint por evento:
   - `POST /api/integrations/openclaw/webhook/{event}`
3. Health:
   - `GET /api/integrations/openclaw/webhook`

## 5. Mapeamento conta -> corretor

Use a API admin:

1. `GET /api/admin/integrations/openclaw`
   - retorna `env`, `mappings`, `brokers`.
2. `POST /api/admin/integrations/openclaw` com `action=upsert_mapping`:

```json
{
  "action": "upsert_mapping",
  "channel": "whatsapp",
  "provider_account_id": "conta-whatsapp-001",
  "account_name": "OpenClaw Atendimento",
  "broker_user_id": "UUID_DO_CORRETOR",
  "is_active": true
}
```

3. `POST /api/admin/integrations/openclaw` com `action=deactivate_mapping`:

```json
{
  "action": "deactivate_mapping",
  "channel": "whatsapp",
  "provider_account_id": "conta-whatsapp-001"
}
```

Observacao:
- o storage usa `provider_account_id` com prefixo `openclaw:`.
- no webhook, o resolvedor tenta tanto `conta` quanto `openclaw:conta`.

## 6. Fluxo inbound

1. OpenClaw envia webhook.
2. Handler normaliza:
   - canal (`whatsapp|instagram|facebook|...`),
   - conta externa (`account_id`),
   - conversa externa (`conversation_id` ou fallback),
   - mensagem/texto/midia.
3. Inbox grava em:
   - `chat_conversations`
   - `chat_messages`
4. Ownership:
   - via `chat_channel_accounts` por `channel + provider_account_id`.
5. Para WhatsApp:
   - tenta enrich por telefone (`leads`/`people`) quando possivel.

## 7. Fluxo outbound

1. Ao enviar mensagem no Inbox, se a conversa for de provider `openclaw`:
   - CRM chama OpenClaw (`OPENCLAW_SEND_TEXT_PATH`).
2. Resultado fica no `payload` da mensagem outbound no `chat_messages`.

## 8. Testes rapidos

Health:

```bash
curl -X GET "https://crm.seudominio.com/api/integrations/openclaw/webhook"
```

Webhook com token:

```bash
curl -X POST "https://crm.seudominio.com/api/integrations/openclaw/webhook?token=SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.received",
    "channel": "whatsapp",
    "account_id": "conta-whatsapp-001",
    "conversation_id": "conv-123",
    "from": "5511999999999",
    "sender_name": "Lead Teste",
    "text": "Oi, tenho interesse",
    "message_id": "msg-abc-123",
    "timestamp": 1760000000
  }'
```

## 9. Checklist

- [ ] Variaveis `OPENCLAW_*` configuradas no ambiente do CRM.
- [ ] Mapeamento de conta OpenClaw criado em `/api/admin/integrations/openclaw`.
- [ ] Webhook OpenClaw apontando para `/api/integrations/openclaw/webhook`.
- [ ] Mensagens inbound chegando em `/inbox`.
- [ ] Outbound funcionando para conversas com `provider=openclaw`.
