# FASE 2 - HIGIENE DE VITRINE (EXECUCAO)

Data: 2026-03-03

## 1. Objetivo da fase

Fechar os 3 itens obrigatorios da Fase 2:
1. Bloquear publicacao de imovel incompleto.
2. Garantir filtro de completude na vitrine publica.
3. Limpar dados de teste/incompletos expostos no publico.

## 2. O que foi implementado

1. Checklist unificado de publicacao em `lib/publicationChecklist.ts`.
2. Bloqueio de bypass de status no CRM (`updatePropertyBasics`) para impedir `status=active` fora do fluxo de publicacao.
3. Publicacao backend exige checklist completo:
   - midia
   - cidade/bairro/endereco
   - latitude/longitude
   - autorizacao digital assinada
4. Vitrine publica filtrando incompletos e test-like:
   - `/imoveis/resultados`
   - `/imoveis/[id]`
   - `imoveis similares`
5. Migration para endurecer `v_public_properties` e `v_public_properties_ext` com guardrails de completude:
   - `supabase/migrations/202603031830_phase2_public_views_hygiene_guard.sql`
6. Endpoint administrativo da Fase 2:
   - `GET /api/admin/phases/phase2` (readiness + resumo de higiene)
   - `POST /api/admin/phases/phase2` (cleanup de ativos incompletos/test-like para `draft`)

## 3. Endpoint oficial de limpeza da Fase 2

Dry-run:

```json
{
  "confirm": true,
  "dry_run": true,
  "include_incomplete": true,
  "include_test_like": true,
  "note": "Validacao fase 2"
}
```

Execucao real:

```json
{
  "confirm": true,
  "dry_run": false,
  "include_incomplete": true,
  "include_test_like": true,
  "note": "Limpeza oficial da vitrine"
}
```

Comportamento:
1. Identifica ativos `active/published`.
2. Marca candidatos por:
   - incompleto de checklist
   - test-like (titulo/descricao/codigo)
3. Atualiza candidatos para `draft`.
4. Registra auditoria em `user_audit_logs` com action `phase2_cleanup_vitrine`.

## 4. Definicao de pronto da Fase 2

1. Imovel incompleto nao aparece na vitrine.
2. Imovel test-like nao aparece na vitrine.
3. `v_public_properties` e `v_public_properties_ext` aplicam guardrails.
4. Existe processo administravel para cleanup oficial.
