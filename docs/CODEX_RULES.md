# Codex Rules — Projeto Unificado Vitrya

## Objetivo
Evoluir CRM + Vitrine pública com padrão premium.

## Stack
- Next.js App Router (Next 15/16)
- Supabase (RLS + Storage privado)
- Tailwind UI premium

## Regras fixas
- Preferir mudanças "plug and play" (arquivos reais e caminhos reais)
- Evitar perguntas; executar e validar com build/test
- RLS por ownership:
  - admin/gestor vê tudo
  - corretor vê apenas onde owner_user_id = auth.uid()
- Não usar tenant_id em pipelines
- Vitrine pública via VIEW pública (Opção B premium)
- Storage: bucket property-media privado
  - path: properties/<propertyId>/<uuid>-<filename>
  - DB guarda somente o path

## Processo
- Sempre rodar:
  - pnpm build
- Fazer commits pequenos e descritivos
- Não misturar features diferentes no mesmo commit
