# Vitrya CRM - Migrations Guide

> **Documentação do schema atual:** [SCHEMA_BASELINE.md](./SCHEMA_BASELINE.md)

## Estrutura de Migrations

As migrations ficam em dois diretórios:

- `/supabase/migrations/` - Migrations base (tasks, catalogs, profiles, automations)
- `/docs/migrations/` - Migrations incrementais (leads, notes, conversion, etc.)

## Convenção de Nomes

```
YYYYMMDD_HHMM_descricao.sql
```

Exemplo: `20260116_1500_add_doctor_function.sql`

## Como Aplicar Migrations

### Ambiente de Desenvolvimento

1. Acesse o Supabase Dashboard
2. Vá em SQL Editor
3. Cole o conteúdo da migration
4. Execute

### Ambiente de Produção

1. Faça backup do banco antes
2. Revise a migration em staging primeiro
3. Aplique via SQL Editor em horário de baixo uso
4. Valide com `/api/admin/doctor`

## Regras Importantes

1. **NUNCA edite uma migration já aplicada** - Crie uma nova migration para correções
2. **SEMPRE teste em dev primeiro** - Nunca aplique direto em produção
3. **SEMPRE faça backup antes** - Use pg_dump ou snapshot do Supabase
4. **DOCUMENTE breaking changes** - Migrations que exigem código novo

## Ordem de Aplicação (Primeira Instalação)

Para instalar do zero, aplique **apenas**:

```
1. docs/migrations/20260116_fix_schema_stabilization.sql (schema completo)
2. supabase/migrations/20260116_1500_doctor_function.sql (função de diagnóstico)
```

**Nota:** A migration `fix_schema_stabilization.sql` é idempotente e cria todas as tabelas, triggers, RLS policies e seed data. As migrations em `supabase/migrations/` são histórico - não precisam ser aplicadas em instalações novas.

## Ordem de Aplicação (Atualização de Sistema Existente)

Se o sistema já tem dados, aplique apenas as migrations incrementais que faltam:

```
1. docs/migrations/20260116_fix_schema_stabilization.sql (se ainda não aplicada)
2. supabase/migrations/20260116_1500_doctor_function.sql (função de diagnóstico)
```

## Verificação Pós-Migration

Após aplicar migrations, verifique:

```bash
curl -X GET https://seu-app/api/admin/doctor \
  -H "Authorization: Bearer TOKEN"
```

Deve retornar `{ "ok": true, ... }`

## Rollback

Para reverter uma migration:

1. Identifique os objetos criados/alterados
2. Crie uma migration de rollback (`YYYYMMDD_rollback_descricao.sql`)
3. Aplique o rollback
4. Documente no commit

**IMPORTANTE:** Rollbacks de dados (DELETE, DROP) são irreversíveis sem backup.
