description: "Agente do projeto Vitrya (Next.js + Supabase) para implementar features com padrão plug-and-play, respeitando RLS por ownership, o Plano Unificado (Sprints 0–8) e a Opção B Premium."
tools: []

# Agente Vitrya — Operação e Guardrails

## Regra #0 (obrigatória)
ANTES de implementar qualquer coisa, sempre ler:
- docs/PROJECT_RULES.md
- docs/PLAN_UNIFICADO.md

Se a tarefa for UI/tema/layout, também ler:
- docs/BRAND_GUIDE.md

Se a tarefa for locação, também ler:
- docs/PRODUCT_RULES.md

Se a tarefa envolver banco/RLS/migrations/storage, também ler: docs/DB_RULES.md

---

## Quando usar
Use este agente para:
- Implementar rotas API (Next.js App Router) e handlers
- Implementar telas do CRM (UI/UX) com padrão consistente
- Criar/ajustar migrations SQL em supabase/migrations
- Criar/ajustar RLS/policies e triggers
- Corrigir erros de build/deploy no Codespaces/EasyPanel

Não use para:
- Inserir segredos/chaves no repositório
- Alterar arquitetura sem pedido explícito
- Usar nomes genéricos (sempre paths reais e schema real)

---

## Contexto do Projeto (fixo, derivado do PROJECT_RULES)
- Next.js App Router + Supabase
- RLS por ownership:
  - Admin ativo vê tudo
  - Usuário vê apenas registros com owner_user_id = auth.uid()
- public.pipelines NÃO possui tenant_id (não aplicar policies por tenant)
- Leads:
  - owner_user_id = dono do lead
  - assigned_to = responsável comercial
  - person_id existe
- Properties:
  - owner_user_id = dono do imóvel
  - schema confirmado no PROJECT_RULES (não inventar colunas como state)

---

## Branches
- main: backend/DB/migrations/rotas e correções funcionais
- identity-visual: alterações de UI/tema/layout/design system

Nunca misturar:
- migrations/policies dentro de identity-visual
- mudanças de UI/tema dentro de main (se forem puramente visuais)

---

## Modo de execução (sempre seguir)
Para cada tarefa:
1) Ler docs/PROJECT_RULES.md
2) Identificar e listar os arquivos que serão alterados (paths reais)
3) Implementar com código completo (sem trechos incompletos)
4) Rodar verificação:
   - npm run build
5) Reportar:
   - o que mudou (curto)
   - como testar (passo a passo)
   - env vars necessárias (sem expor valores)

---

## Padrões de segurança
- Nunca commitar .env.local / .env*
- Nunca imprimir chaves de API
- Preferir validação server-side nas rotas API
- Respeitar RLS: não contornar com service role no frontend

---

## Padrões de migrations
- Criar novas migrations em supabase/migrations
- Não editar migrations já aplicadas em produção sem motivo
- Usar "drop policy if exists" antes de "create policy"
- Manter SQL idempotente quando possível
