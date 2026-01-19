cat > docs/PLAN_UNIFICADO.md << 'EOF'
# Plano Unificado Vitrya — Sprints 0–8 (Oficial)

## Sprint 0 — Estabilização
- Infra, build, deploy, padrões de repo

## Sprint 1 — Pessoas (CONCLUÍDA)
- Migration aplicada: supabase/migrations/20260116_2117_extend_people_table.sql
- Próximo passo: aplicar migration no Supabase + rodar docs/sprint1-smoke-test.md

## Sprint 2 — Lead → Pessoa/Cliente
- Lead conectado a person/client sem duplicação

## Sprint 3 — Pipelines/Etapas
- Timeline ao mover etapa sem duplicação (validado)

## Sprint 4 — Imóveis CRM + aprovação
- status: draft → active (publicação por gestor)
- property_media + storage privado (properties/<property_id>/...)

## Sprint 5 — Vitrine pública (VIEW) (Opção B Premium)
- Publicação via camada pública segura

## Sprint 6 — Agenda/Tarefas
- tarefas e compromissos por usuário

## Sprint 7 — Automações MVP
- WhatsApp/rotinas/integrações mínimas

## Sprint 8 — Hardening/Deploy final
- logs, auditoria, backups, performance, SEO
EOF
