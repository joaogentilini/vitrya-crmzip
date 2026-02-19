# Mapeamento de Rotas - Modulo de Incorporacoes

## CRM (interno)
- `/properties/incorporations`
  - Hub de construtoras (cards), criacao de construtora (admin/gestor) e criacao de empreendimento.
- `/properties/incorporations/developers/[developerId]`
  - Detalhe da construtora, comissao base, lista de empreendimentos e criacao de novo empreendimento.
- `/properties/incorporations/[incorporationId]`
  - Detalhe do empreendimento com abas:
    - `tab=overview` (dados gerais/registro/publicacao)
    - `tab=features` (caracteristicas dinamicas herdadas)
    - `tab=plans` (tipologias, editor rapido, aplicacao em lote, edicao de andares)
    - `tab=media` (midias/documentos, ordenacao e visibilidade)
    - `tab=virtual_tour` (tour RV por empreendimento/tipologia)
    - `tab=availability` (espelho de vendas por bloco/andar/coluna + reserva)
    - `tab=reservations` (minhas reservas/reservas gerais + proposta para incorporadora)

## Publico
- `/empreendimentos`
  - Lista geral de empreendimentos ativos.
- `/empreendimentos/construtoras`
  - Listagem por construtora.
- `/empreendimentos/[slug]`
  - Landing publica do empreendimento (sem unidade individual).

## API - Integracoes de Portais (base pronta)
- `/api/integrations/grupoolx/feed.xml`
  - Feed XML para publicacao no Grupo OLX.
- `/api/integrations/grupoolx/leads`
  - Webhook de leads Grupo OLX.
- `/api/integrations/olx/leads`
  - Webhook de leads OLX.
- `/api/integrations/olx/publish`
  - Base de publicacao/listing OLX.
- `/api/admin/integrations/portals`
  - Painel tecnico (admin/gestor) para estado/config de integracoes.
- `/api/admin/integrations/portals/events`
  - Eventos recebidos dos webhooks.

## ERP interno (sem API externa)
- O ERP consome diretamente as tabelas do CRM no mesmo banco.
- A proposta enviada ja marca `erp_sync_status='synced'` e registra log interno de auditoria.
- Nao existe endpoint externo para sincronizacao ERP neste modo.

## Dependencias/acoes do modulo
- `app/(crm)/properties/incorporations/actions.ts`
  - Reserva atomica, criacao de proposta, conversao para venda, tipologia/media/espelho, comissao.
- `supabase/migrations/202602171500_incorporations_foundation.sql`
  - Base estrutural do modulo.
- `supabase/migrations/202602172315_incorporation_reservation_client_and_proposals.sql`
  - Reserva com nota interna + proposta comercial.
- `supabase/migrations/202602171340_incorporation_proposal_delivery_erp_sync.sql`
  - Status de entrega (email/whatsapp), PDF, sync ERP e logs de auditoria.

## Variaveis de ambiente relacionadas
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `WHATSAPP_META_ENABLED`
- `WHATSAPP_CLOUD_API_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
