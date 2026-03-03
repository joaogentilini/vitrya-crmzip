# FASE 3 - EVOLUTION SETUP (PASSOS 1 E 2)

Data: 2026-03-03

## 1. Objetivo

Executar os dois primeiros passos do WhatsApp Evolution:
1. base self-hosted (servidor proprio),
2. criacao de instancias por corretor com QR connect no CRM.

## 2. Entregas no projeto

1. Cliente Evolution API:
   - `lib/integrations/evolution/client.ts`
2. API admin para operar instancias:
   - `app/api/admin/integrations/whatsapp/evolution/route.ts`
3. Tela no CRM:
   - `app/(crm)/settings/whatsapp/page.tsx`
   - `app/(crm)/settings/whatsapp/WhatsappSettingsClient.tsx`
4. Webhook inbound Evolution para Inbox:
   - `app/api/integrations/whatsapp/evolution/webhook/route.ts`
   - `app/api/integrations/whatsapp/evolution/webhook/[event]/route.ts`
5. Navegacao:
   - item `Configuracoes > WhatsApp` em `components/layout/AppShell.tsx`
6. Infra self-hosted:
   - `deploy/evolution/.env.example`
   - `deploy/evolution/docker-compose.yml`

## 3. Variaveis de ambiente (CRM)

Adicionar no ambiente do CRM:

```env
EVOLUTION_API_ENABLED=1
EVOLUTION_API_BASE_URL=https://whatsapp.seudominio.com
EVOLUTION_API_KEY=troque-para-a-chave-da-evolution
EVOLUTION_WEBHOOK_URL=https://crm.seudominio.com/api/integrations/whatsapp/evolution/webhook
EVOLUTION_WEBHOOK_ENABLED=1
EVOLUTION_WEBHOOK_TOKEN=troque-este-token-webhook
```

Opcional (se sua instalacao usa rotas diferentes):

```env
EVOLUTION_FETCH_INSTANCES_PATH=/instance/fetchInstances
EVOLUTION_CREATE_INSTANCE_PATH=/instance/create
EVOLUTION_CONNECT_INSTANCE_PATH=/instance/connect/{instance}
EVOLUTION_CONNECTION_STATE_PATH=/instance/connectionState/{instance}
EVOLUTION_DELETE_INSTANCE_PATH=/instance/delete/{instance}
EVOLUTION_SEND_TEXT_PATH=/message/sendText/{instance}
```

## 4. Subida da Evolution (servidor proprio)

No servidor da Evolution:

1. Copiar `deploy/evolution/.env.example` para `.env` e ajustar valores.
2. Subir stack:

```bash
docker compose -f deploy/evolution/docker-compose.yml up -d
```

3. Conferir API:

```bash
curl -sS http://SEU_HOST:8080/ | head
```

## 5. Operacao no CRM (passo 2)

1. Acessar `Configuracoes > WhatsApp`.
2. Criar uma instancia por corretor (nome da instancia + corretor responsavel).
3. Escanear QR retornado na tela.
4. Usar botoes:
   - `QR` para regenerar QR,
   - `Estado` para consultar estado remoto.

## 6. Testes de ponta a ponta

1. Teste inbound (webhook -> Inbox):
   - Envie mensagem do WhatsApp conectado para o numero da instancia.
   - Verifique a conversa em `CRM > Inbox` com canal `WhatsApp`.
2. Teste outbound (Inbox -> Evolution):
   - Abra a conversa e envie texto pelo composer.
   - A mensagem deve chegar no WhatsApp do cliente e ficar com status `sent` no historico.
3. Health do webhook:

```bash
curl -X GET "https://crm.seudominio.com/api/integrations/whatsapp/evolution/webhook"
```

4. Teste rapido de webhook autenticado:

```bash
curl -X POST "https://crm.seudominio.com/api/integrations/whatsapp/evolution/webhook?token=SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event":"CONNECTION_UPDATE","instance":"teste"}'
```

## 7. Observacoes

1. Esta entrega cobre setup + provisionamento/QR + inbound/outbound WhatsApp via Evolution.
2. O endpoint aceita:
   - `/api/integrations/whatsapp/evolution/webhook`
   - `/api/integrations/whatsapp/evolution/webhook/messages-upsert`
3. Se `EVOLUTION_WEBHOOK_TOKEN` estiver configurado, o token pode ser enviado via query `?token=...`, header `x-webhook-token`, `apikey` ou `Bearer`.

## 8. Troubleshooting rapido

Erro comum no log da Evolution:

```txt
[Redis] redis disconnected
```

Ajuste no `.env` da Evolution:

```env
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://evolution-redis:6379/6
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_LOCAL_ENABLED=false
```

Depois reinicie a stack:

```bash
docker compose down
docker compose up -d
docker logs evolution-api --tail 200
```
