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


