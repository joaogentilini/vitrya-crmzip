# Migrations Stabilization (No Reset)

Este runbook padroniza o hardening de migrations no Vitrya para destravar `db push` sem resetar banco.

## 1) Detectar versões duplicadas locais

Comando recomendado:

```bash
npm run migrations:check-duplicates
```

Sem script npm:

```bash
node scripts/migrations/check-duplicate-versions.mjs
```

Regra de versão usada: sequência numérica no início do nome do arquivo, até o primeiro caractere não numérico.

## 2) Como renomear corretamente

Quando houver duplicidade (ex.: `20260224` em múltiplos arquivos), renomear com `git mv` para timestamp completo e único:

```bash
git mv supabase/migrations/20260224_1100_x.sql supabase/migrations/20260224110000_x.sql
git mv supabase/migrations/20260224_1115_y.sql supabase/migrations/20260224111500_y.sql
```

Regras:
- Manter o sufixo descritivo do arquivo.
- Preservar ordem cronológica.
- Não alterar SQL, exceto quando necessário para idempotência.

## 3) Quando usar `migration repair`

Usar `repair` apenas para alinhar histórico entre local e remoto, sem executar SQL.

### `applied`
Use quando a migration já existe/aplicou no remoto e você quer marcar como aplicada no histórico.

```bash
npx supabase migration repair --status applied <version>
```

### `reverted`
Use quando uma versão foi marcada/aplicada indevidamente e precisa sair do histórico.

```bash
npx supabase migration repair --status reverted <version>
```

## 4) Fluxo padrão de validação

```bash
npx supabase migration list
npx supabase db push --include-all
```

Se `db push` falhar com:

`duplicate key value violates unique constraint schema_migrations_pkey`

fazer checklist:
1. Rodar `npm run migrations:check-duplicates`.
2. Renomear localmente as versões duplicadas.
3. Validar se a versão do erro já existe no remoto.
4. Aplicar `migration repair` (`applied` ou `reverted`) conforme necessário.
5. Repetir `migration list` e `db push --include-all`.

## 5) Pré-requisito de autenticação Supabase CLI

Se aparecer erro:

`Access token not provided`

configure autenticação antes de `migration list/db push`:

```bash
npx supabase login
```

ou exporte variável:

```bash
SUPABASE_ACCESS_TOKEN=...
```

## 6) Notas de segurança

- Não usar reset (`db reset`) em produção.
- Preferir SQL idempotente:
  - `create ... if not exists`
  - `drop ... if exists`
  - `create or replace`
- Nunca criar FK dependente antes da tabela base existir.
