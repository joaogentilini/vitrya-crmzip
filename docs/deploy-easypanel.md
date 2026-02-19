# Deploy no EasyPanel - Vitrya CRM

## Variáveis de Ambiente Necessárias

### Obrigatórias

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJ...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJ...
```

### Opcionais

```env
NODE_ENV=production
PORTAL_INTEGRATIONS_ENABLED=0
GRUPO_OLX_WEBHOOK_TOKEN=troque-este-token
GRUPO_OLX_FEED_TOKEN=troque-este-token
OLX_WEBHOOK_TOKEN=troque-este-token
# Futuro (OAuth OLX)
# OLX_CLIENT_ID=...
# OLX_CLIENT_SECRET=...
# OLX_REDIRECT_URI=...
```

## Configuração no EasyPanel

### 1. Criar Serviço

1. Acesse EasyPanel
2. Criar novo serviço → App
3. Selecionar repositório GitHub
4. Branch: `main`

### 2. Build Settings

```
Build Command: npm run build
Start Command: npm start
Port: 3000
```

### 3. Environment Variables

Adicione as variáveis listadas acima em **Settings → Environment**.

> **IMPORTANTE:** Nunca exponha SUPABASE_SERVICE_ROLE_KEY no frontend.

### 4. Deploy

1. Clique em **Deploy**
2. Aguarde o build completar
3. Verifique os logs para erros

## Aplicar Migrations

### Antes do Primeiro Deploy

1. Acesse o Supabase Dashboard
2. Vá em SQL Editor
3. Execute em ordem:
   - `supabase/migrations/20260113_create_user_profiles_roles.sql`
   - `docs/migrations/20260116_fix_schema_stabilization.sql`
   - `supabase/migrations/20260116_1500_doctor_function.sql`

### Validar Migrations

Após aplicar, verifique:

```bash
curl -X GET https://seu-app.easypanel.host/api/admin/doctor \
  -H "Authorization: Bearer SEU_TOKEN"
```

Deve retornar `{ "ok": true, ... }`

## Rollback do App

### Via EasyPanel

1. Vá em **Deployments**
2. Selecione o deploy anterior
3. Clique em **Rollback**

### Via Git

```bash
git revert HEAD
git push origin main
```

## Rollback de Migrations

1. Identifique objetos criados na migration
2. Crie migration de rollback
3. Execute no Supabase SQL Editor

> **AVISO:** Rollbacks de dados (DELETE, DROP) são irreversíveis sem backup.

## Troubleshooting

### Erro 500 ao criar usuário

1. Verifique `SUPABASE_SERVICE_ROLE_KEY` está configurada
2. Verifique logs do servidor para requestId
3. Verifique se migrations foram aplicadas

### Kanban não carrega stages

1. Execute `/api/admin/doctor` para verificar
2. Se `missing_tables` incluir `pipelines` ou `pipeline_stages`, aplique migrations
3. Verifique seed data foi inserido

### Usuário não consegue logar

1. Verifique usuário existe no Supabase Auth
2. Verifique profile existe e `is_active = true`
3. Verifique RLS policies

## Monitoramento

### Endpoints de Health Check

- `/api/health` - Status básico
- `/api/admin/doctor` - Diagnóstico do banco (requer auth admin)

### Logs

Os logs incluem:
- `requestId` - ID único por request
- `timestamp` - Horário
- `level` - INFO/WARN/ERROR
- `endpoint` - Rota chamada
- `userId` - Usuário autenticado (quando aplicável)

Em produção, secrets são automaticamente redatados dos logs.

## Checklist de Deploy

- [ ] Variáveis de ambiente configuradas
- [ ] Migrations aplicadas no Supabase
- [ ] Doctor check retorna `ok: true`
- [ ] Smoke test passou (ver docs/sprint0-smoke-test.md)
- [ ] Primeiro usuário logado e virou admin
