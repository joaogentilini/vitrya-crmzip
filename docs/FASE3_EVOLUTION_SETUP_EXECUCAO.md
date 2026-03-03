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
4. Navegacao:
   - item `Configuracoes > WhatsApp` em `components/layout/AppShell.tsx`
5. Infra self-hosted:
   - `deploy/evolution/.env.example`
   - `deploy/evolution/docker-compose.yml`

## 3. Variaveis de ambiente (CRM)

Adicionar no ambiente do CRM:

```env
EVOLUTION_API_ENABLED=1
EVOLUTION_API_BASE_URL=https://whatsapp.seudominio.com
EVOLUTION_API_KEY=troque-para-a-chave-da-evolution
EVOLUTION_WEBHOOK_URL=https://crm.seudominio.com/api/integrations/whatsapp/evolution/webhook
```

Opcional (se sua instalacao usa rotas diferentes):

```env
EVOLUTION_FETCH_INSTANCES_PATH=/instance/fetchInstances
EVOLUTION_CREATE_INSTANCE_PATH=/instance/create
EVOLUTION_CONNECT_INSTANCE_PATH=/instance/connect/{instance}
EVOLUTION_CONNECTION_STATE_PATH=/instance/connectionState/{instance}
EVOLUTION_DELETE_INSTANCE_PATH=/instance/delete/{instance}
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

## 6. Observacoes

1. Esta entrega cobre setup + provisionamento/QR.
2. O webhook inbound da Evolution para alimentar o Inbox sera conectado no proximo passo.
