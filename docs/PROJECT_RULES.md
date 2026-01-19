cat > docs/PROJECT_RULES.md << 'EOF'
# PROJECT_RULES — Vitrya (Fonte Única de Verdade)

## Arquitetura Premium (Opção B)
- vitrya.com.br = site vitrine público
- app.vitrya.com.br = CRM autenticado
- Mesma fonte de verdade (Supabase)
- Publicação por aprovação do gestor
- Vitrine exibe endereço completo + mapa + POIs
- Vitrine NUNCA expõe dados do proprietário/cliente

## RLS / Segurança (Ownership)
- Admin ativo vê tudo
- Usuário vê apenas registros onde owner_user_id = auth.uid()
- public.pipelines NÃO possui tenant_id (não aplicar policies por tenant)
- Leads e Pipelines devem respeitar ownership por owner_user_id

## Branches
- main: migrations, rotas, backend, correções funcionais
- identity-visual: mudanças de UI/tema/layout/design system
Regra: não misturar DB/migrations dentro de identity-visual.

## Banco (nomes reais)
- leads: usar owner_user_id (não usar owner_profile_id)
- properties: não inventar colunas (ex.: NÃO existe state)
EOF
