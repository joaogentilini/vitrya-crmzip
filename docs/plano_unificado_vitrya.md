# 📘 PLANO UNIFICADO VITRYA — DOCUMENTO MASTER

## 1. Visão Geral

**Vitrya** é um ecossistema imobiliário completo, premium e escalável, composto por:

* CRM Operacional
* Vitrine Pública SEO-first
* ERP Imobiliário
* RP (Relacionamento e Pós-venda)
* Aplicativos (Corretor e Cliente)
* Automações
* Agentes Inteligentes (GPT)

Todo o sistema compartilha **um único backend (Supabase)**, com regras claras de segurança, ownership e reaproveitamento de dados.
Nenhuma funcionalidade deve ser duplicada se já existir algo equivalente.

---

## 2. Princípios Arquiteturais (NÃO NEGOCIÁVEIS)

1. **Banco único**

   * Supabase Postgres
   * VIEW pública para vitrine
   * Nada sensível exposto

2. **Ownership**

   * `owner_user_id` como regra principal
   * Admin/Gestor vê tudo
   * Usuário vê apenas o que é dele

3. **Incremental**

   * Nada de reescrita grande
   * Evolução por sprints pequenos

4. **Pesquisa antes de criar**

   * Nunca criar tabela/coluna/view sem pesquisar o schema existente

5. **Fonte única**

   * Este documento é a verdade do projeto
   * Qualquer mudança relevante deve ser registrada aqui

---

## 3. Estrutura Atual do Projeto

### Frontend

* **CRM:** `app/(crm)`
* **Auth:** `app/(crm-auth)`
* **Vitrine Pública:** `app/(public)`

### Backend

* Supabase (Postgres + RLS)
* Storage privado (`property-media`)
* Migrations versionadas

---

## 4. FASE 1 — CRM (CORE OPERACIONAL)

### Status: ✅ CONCLUÍDA

Inclui:

* Pessoas (clientes, proprietários, corretores)
* Leads
* Pipelines
* Campanhas
* Imóveis
* Documentos
* Dashboard
* Storage e mídias
* Controle de acesso (RLS)

📌 Esta camada é o **coração do sistema** e não deve ser duplicada em nenhuma outra fase.

---

## 5. FASE 2 — VITRINE PÚBLICA (SEO + CONVERSÃO)

### Status: ⚠️ FUNCIONAL, COM AJUSTES PENDENTES

Já implementado:

* Listagem de imóveis
* Detalhe do imóvel
* Busca e filtros
* Cards premium
* Integração via VIEW pública

### Problemas conhecidos (OBRIGATÓRIO CORRIGIR)

* Ícones do Google aparecendo como texto no EasyPanel
* Palavras “fantasma” renderizadas no HTML
* Diferença entre build local e produção

### Sprint SEO Premium (pendente)

* Revisão de imports de ícones
* Correção de JSX inválido
* Build production validado
* Meta tags dinâmicas
* OpenGraph
* Sitemap
* Robots
* Canonical
* Schema.org (RealEstate)

---

## 6. FASE 3 — ERP IMOBILIÁRIO

### Status: ❌ NÃO INICIADO

### ERP Financeiro

* Contratos (venda/locação)
* Parcelas
* Comissões
* Repasse
* Centro de custo
* Histórico financeiro

### ERP Jurídico

* Contratos versionados
* Documentos obrigatórios
* Status jurídico
* Pendências legais

### ERP Operacional

* Agenda financeira
* Tarefas automáticas
* Cobranças
* Alertas

📌 Tudo integrado às tabelas já existentes (`people`, `properties`, `campaigns`).

---

## 7. FASE 4 — RP (RELACIONAMENTO & PÓS-VENDA)

### Status: ❌ NÃO INICIADO

Inclui:

* Linha do tempo pós-fechamento
* Follow-ups automáticos
* Reativação de clientes
* Base de indicações
* Histórico contínuo de relacionamento

---

## 8. FASE 5 — APLICATIVOS

### Status: ❌ NÃO INICIADO

### App do Corretor (PWA primeiro)

* Leads
* Agenda
* Imóveis
* Campanhas
* Notificações

### App do Cliente

* Imóveis favoritos
* Propostas
* Documentos
* Status do processo
* Comunicação com corretor

📌 Mesmo backend, sem duplicar regras.

---

## 9. FASE 6 — AUTOMAÇÕES

### Status: ⚠️ MVP EXISTE / AVANÇO PENDENTE

* Gatilhos por evento/tempo
* Templates reutilizáveis
* Log de execução
* Retry
* Base para WhatsApp e Email

---

## 10. AGENTES GPT DO ECOSSISTEMA VITRYA

### 1. Agente Dev Lead Vitrya

* Desenvolvimento
* Arquitetura
* Supabase
* Correções
* Checkpoints

### 2. Agente SEO Vitrya

* SEO técnico
* Diagnóstico
* Performance
* Indexação

### 3. Agente Conteúdo

* Descrições de imóveis
* Blog
* Copy imobiliária

### 4. Agente RP

* Pós-venda
* Follow-ups
* Scripts de relacionamento

### 5. Agente Suporte Interno

* Treinamento
* Dúvidas operacionais

---

## 11. Ordem Correta de Execução

1. Sprint SEO Premium (obrigatório)
2. ERP Financeiro
3. ERP Jurídico
4. RP
5. Apps
6. Automações avançadas
7. Hardening final

---

## 12. LOG DE EVOLUÇÃO (MODELO)

```
YYYY-MM-DD — descrição da mudança — arquivos envolvidos — status
```

---

## 13. CHECKPOINT ATUAL

```
Checkpoint ID: VITRYA-CP-20260209-MASTERDOC
Palavra-chave de retomada:
RETOMAR: VITRYA-MASTERDOC
```

---

## 14. PLANO V1 EXECUTAVEL (2026-03-02)

### Opiniao tecnica sincera (antes de executar)

1. O diagnostico do produto esta correto: CRM forte, Vitrine forte, gap principal no ERP.
2. O plano anterior cobre bem o "o que", mas mistura demais o "como" e o "quando".
3. Para V1 real, o risco maior nao e UI, e integracao omnichannel + operacao diaria (SLA, fila, ownership e qualidade de dados).
4. Sem gate de aceite por fase, o projeto alonga e nao fecha V1 de verdade.

### Escopo V1 (o que precisa estar pronto)

1. ERP sem placeholders:
   - Visao Geral
   - Negociacoes
   - Contratos/Vendas
   - Relatorios (DRE simplificada + Fluxo de Caixa)
2. Chat unificado operacional para corretor:
   - WhatsApp
   - Instagram
   - Facebook
   - Portais (OLX/Grupo OLX)
3. Automacao de qualificacao e follow-up com regras editaveis.
4. Portal do Cliente funcional (login + acompanhamento basico).
5. Higiene de publicacao (sem imovel incompleto na vitrine publica).

### Ordem de execucao recomendada (sequencia obrigatoria)

1. Fase 0 - Trava de escopo e criterio de pronto (3 dias)
   - Definir o que entra em V1 e o que fica para V1.1.
   - Definir KPI de aceite por modulo.
   - Congelar backlog paralelo durante execucao V1.

2. Fase 1 - ERP base visivel (2 semanas)
   - Implementar `app/(erp)/erp/page.tsx` com KPIs executivos reais.
   - Implementar `app/(erp)/erp/negociacoes/page.tsx` com lista, filtro e status machine.
   - Implementar `app/(erp)/erp/contratos/page.tsx` com deals confirmados e status financeiro.
   - Implementar `app/(erp)/erp/relatorios/page.tsx` com DRE simplificada + Fluxo de Caixa.
   - Reusar tabelas ja existentes: `deals`, `deal_commission_snapshots`, `receivables`, `payables`, `payments`.

3. Fase 2 - Higiene de dados e vitrine (3 dias)
   - Bloquear publicacao sem foto, bairro/cidade e lat/lng.
   - Ajustar `v_public_properties`/`v_public_properties_ext` para filtrar imovel incompleto.
   - Limpar dados de teste da vitrine.

4. Fase 3 - Chat unificado (Sprint 1: fundacao, 2 semanas)
   - Criar schema de inbox (`conversations`, `messages`, `conversation_participants`, `conversation_labels`).
   - Criar tela Inbox no CRM com lista de conversas + painel de contexto (lead/imovel/historico).
   - Integrar WhatsApp primeiro (canal piloto).
   - Garantir tempo real via Realtime e trilha de auditoria.

5. Fase 4 - Chat unificado (Sprint 2: multicanal, 2 semanas)
   - Integrar Instagram e Facebook via Graph API.
   - Conectar ingestao de portais ao mesmo pipeline de conversa (base de portal ja existe).
   - Implementar roteamento por corretor com ownership claro.

6. Fase 5 - IA de qualificacao e follow-up (2 semanas)
   - Bot de qualificacao por origem/canal (compra x locacao, faixa de preco, urgencia).
   - Preencher campos do lead automaticamente.
   - Regras de follow-up por tempo sem resposta.
   - Painel admin para templates e regras (aproveitar base de automations existente).

7. Fase 6 - Portal do Cliente (1 semana)
   - Entregar rota publica real para "Acesso Cliente".
   - Login (magic link) + timeline de proposta/negociacao + documentos + boletos.

8. Fase 7 - Locacao MVP financeiro (2 semanas)
   - Contrato de locacao com parcelas mensais.
   - Baixa automatica por webhook e repasse ao proprietario.
   - Extrato simples de repasse.

9. Fase 8 - Go-live V1 (1 semana)
   - Testes E2E dos fluxos criticos.
   - Hardening de RLS, logs e monitoramento.
   - Treinamento rapido do time e checklist de operacao.

### Prazos realistas

1. Equipe enxuta (1 dev full-time): 14 a 18 semanas.
2. Equipe pequena (2 devs full-time): 10 a 12 semanas.
3. O maior risco de prazo esta em APIs de canais (Meta/WhatsApp) e governanca operacional.

### Gates de aceite (Definition of Done)

1. Gate ERP: nenhuma rota ERP em placeholder.
2. Gate Publico: nenhum imovel incompleto listado em `/imoveis`.
3. Gate Chat: 100% das entradas dos canais chegam no Inbox com dono.
4. Gate IA: automacao cria acao de follow-up sem intervenção manual.
5. Gate Cliente: botao "Acesso Cliente" leva para fluxo funcional.

Documento de execucao atual:
- `docs/FASE0_FASE1_EXECUCAO.md`
- `docs/FASE2_EXECUCAO.md`
- `docs/FASE3_SPRINT1_EXECUCAO.md`
- `docs/FASE3_SPRINT2_EXECUCAO.md`
- `docs/FASE3_EVOLUTION_SETUP_EXECUCAO.md`

### Endpoint de kickoff da Fase 1

1. Readiness (o que ja esta pronto para producao):
   - `GET /api/admin/phases/phase1`
2. Iniciar oficialmente a Fase 1:
   - `POST /api/admin/phases/phase1`
   - Body: `{ "confirm": true, "note": "Iniciando Fase 1 ERP V1" }`
3. Resultado:
   - Gera `checkpoint_id` e registra em `user_audit_logs` com action `phase1_kickoff`.

### Endpoint da Fase 2 (higiene de vitrine)

1. Readiness e diagnostico de limpeza:
   - `GET /api/admin/phases/phase2`
2. Dry-run e execucao da limpeza:
   - `POST /api/admin/phases/phase2`
   - Body exemplo (dry-run): `{ "confirm": true, "dry_run": true }`
   - Body exemplo (execucao): `{ "confirm": true, "dry_run": false }`
3. Resultado:
   - Rebaixa para `draft` os ativos incompletos/test-like.
   - Registra auditoria em `user_audit_logs` com action `phase2_cleanup_vitrine`.
