

# PLANO COMPLETO (OFICIAL) — VITRYA OS

Vitrya em 5 frentes — **CRM (núcleo), ERP (financeiro), Automações (n8n), IA (operacional/comercial), App (campo/gestão)** — com **funções detalhadas** e a **arquitetura do Agente Principal Vitrya + subagentes**.

Vou organizar assim:

1. Visão do ecossistema (como tudo conversa)
2. Funções detalhadas por módulo (CRM, Vitrine, ERP)
3. Automações n8n (fluxos prontos)
4. IA (o que ela faz na prática)
5. App (campo e gestão)
6. Arquitetura do “Agente Principal” e subagentes
7. Roadmap por fases (MVP → v1 → v2) + Sprints (Plano Unificado)

---

## 1) VISÃO GERAL DO ECOSSISTEMA VITRYA

**Objetivo:** operar a Vitrya com execução diária previsível, sem dispersão, com visão gerencial clara.

* **CRM**: fonte de verdade comercial e operacional (leads, pessoas, imóveis, tarefas, campanhas, pipeline).
* **Vitrine Pública**: fonte de verdade pública (imóveis online e experiência do cliente).
* **ERP**: fonte de verdade financeira (comissões, receitas, despesas, DRE, previsão).
* **n8n**: motor de automação (integra e executa rotinas; escreve logs no CRM).
* **IA**: “operador invisível” (prioriza, escreve, cobra, resume, recomenda próxima ação).
* **App**: braço de rua (captação, visita, mídia, checklist, assinatura/termos).

**Regra de ouro:**

> CRM registra intenção e relacionamento. ERP registra dinheiro. n8n movimenta. IA decide e recomenda. Vitrine converte.

**Arquitetura adotada (já decidida):**

* **Opção B premium**: site público no domínio principal (vitrine) + CRM em subdomínio, compartilhando o mesmo banco.
* Imóvel aprovado no CRM publica na vitrine via **VIEW pública** (sem expor dados do proprietário).

---

## 2) FUNÇÕES DETALHADAS POR MÓDULO

# 2A) CRM (NÚCLEO) — FUNÇÕES DETALHADAS

### 2A.1 Cadastros essenciais

* **Pessoas** (comprador, vendedor, proprietário, investidor; tags; notas; documento; telefones; etc.)
* **Leads** (origem, interesse, status; vínculo com pessoa)
* **Imóveis (CRM)** (captação, estoque, status, categoria, endereço completo + geolocalização, mídia, documentos)
* **Pipelines e etapas** (kanban)
* **Atividades/Tarefas** (follow-up, visita, proposta, retorno)
* **Corretores/usuários** (roles e ownership)

**Regras fixas já adotadas:**

* **RLS por ownership**: admin vê tudo; usuário vê apenas o que é dele via `owner_user_id = auth.uid()`.
* Sem `tenant_id` em pipelines (políticas por ownership).

---

### 2A.2 Pipeline e Kanban (Leads/Negócios)

* Múltiplos pipelines (Vendas, Locação, Industrial, Alto padrão etc.)
* Stages configuráveis por pipeline
* Regras por stage (ex.: “Proposta” exige valor, validade, anexo)
* Gatilhos (stage muda → cria tarefa / agenda / mensagem)

**Refinamento futuro obrigatório (você pediu):**

* Kanban de leads sem ultrapassar largura:

  * colunas colapsáveis + contador
  * hover/expand para detalhe
  * modo “3 colunas visíveis” para arrastar sem scroll lateral

---

### 2A.3 Imóveis CRM (módulo completo)

* Criação de imóvel **draft** (rascunho)
* Edição do imóvel (visão geral)
* Publicação (aprovação e regras)
* **Mídias**: upload, reorder, set cover, delete
* **Documentos**: anexos do imóvel e compliance
* Categoria/classificação do imóvel (tabela de categorias + select)

**Obrigatórios para publicar (já definido):**

* Endereço completo (logradouro + número + bairro + CEP + cidade + UF)
* Geolocalização (lat/lng) vinculada ao Maps
* Autorização/termo do proprietário para anunciar/publicar (armazenado no CRM, com futura assinatura digital)

**Mudança de status pedida (futura):**

* “draft → offline”
* “active → online”
* Vitrine só exibe “online”

---

### 2A.4 Campanhas (operacional por imóvel) — regra do jogo

**Conceito:** campanha é o motor de execução dos primeiros 30 dias (forte) pós-publicação e depois manutenção.

* Campanha por imóvel (primeiros 30 dias fortes) com visão Kanban geral.
* Tarefas “plug and play” por tipo/categoria de imóvel.
* Templates editáveis via dashboard (admin/gestor).
* Atividades diárias/semanais/mensais/totais por imóvel.
* Registro da execução (com data, responsável, evidência/link).

**Onde fica:**

* **Página dedicada `/campaigns`** (Kanban completo para execução)
* **Resumo no topo em “Meus Imóveis”** (atalho operacional)
* **Métricas no Dashboard** (cards separados de Leads)
* **Dentro do imóvel (CRM)**: seção/aba “Campanha” com histórico e próximas ações.

---

### 2A.5 Gestão e performance

* Metas por corretor (VGV, visitas, conversão)
* Atividades por dia/semana
* Funil por origem
* Tempo médio por stage (gargalos)
* Ranking saudável (sem ruído)

---

### 2A.6 Compliance e governança

* Pasta do negócio
* Termos e fichas
* Regras de permissão (gestor/corretor)
* Auditoria: “faltando dados obrigatórios para publicar”

---

# 2B) VITRINE PÚBLICA — FUNÇÕES DETALHADAS

### 2B.1 Pesquisa e resultados

* Página `/imoveis` (busca)
* Página `/imoveis/resultados` com filtros
* Filtro por **categoria** via `?category=<uuid>`
* Card com thumb e (futuro) carrossel de imagens

### 2B.2 Detalhe do imóvel público `/imoveis/[id]`

* Hero com título, localização, categoria, chips
* Galeria/Carrossel com fullscreen
* Valor principal (venda ou locação)
* Seções: descrição, características, localização com link Maps
* CTA WhatsApp e agendar visita

**Pendências/ajustes de vitrine (já mapeado):**

* Ajustar tamanho/centralização da foto/galeria (sem quebrar layout)
* Ajustar fonte do campo de busca
* Botão “Área do corretor” mais discreto/menor
* Logo oficial +50% mantendo topbar no mesmo tamanho

### 2B.3 WhatsApp e corretor responsável (futuro obrigatório)

* Trocar `55SEUNUMEROAQUI` pelo número real da Vitrya
* Card do **corretor responsável** no detalhe do imóvel:

  * foto, nome, contatos, CTA WhatsApp
* Página pública do corretor:

  * bio, contatos, lista de imóveis online daquele corretor

### 2B.4 Sinalização de disponibilidade (futuro obrigatório)

* Disponível / Reservado / Vendido (visível no público e no CRM)
* Regra: “vendido” fica online por até 7 dias e sai automaticamente depois

---

# 2C) ERP (FINANCEIRO) — FUNÇÕES DETALHADAS

### 2C.1 Contas e lançamentos

* Contas a receber (comissões, repasses)
* Contas a pagar (mkt, aluguel, ferramentas, tráfego, equipe)
* Centro de custo (Vendas, Locação, Marketing, Administrativo)
* Categorias (fixo/variável, imposto, comissionamento)

### 2C.2 Comissão e split automático

* Regras de comissão por produto (industrial, alto padrão, locação)
* Split por papel (captador, vendedor, gestor, indicação, parceria interna/externa)
* Aprovação do gestor antes de virar financeiro
* Cronograma de pagamento (entrada/parcelado)

### 2C.3 Fluxo de caixa e DRE

* Fluxo de caixa diário/semana/mês
* DRE simplificado
* Previsão (pipeline → previsão de recebimento)

### 2C.4 Conciliação e comprovantes

* Anexo de comprovante
* Status (pendente, pago, vencido)
* Alertas automáticos

---

## 3) AUTOMAÇÕES (n8n) — FLUXOS PRONTOS (MVP → EXPANSÃO)

**Regra:** toda automação escreve no CRM (log do que foi feito e por quê).

### 3.1 Entrada de leads (captura omnichannel)

* Instagram/WhatsApp/Form → cria lead + pessoa + origem
* Enriquecimento (tag, cidade, interesse)
* Mensagem automática “recebi seu contato”
* SLA: tarefa “primeiro contato em X minutos”

### 3.2 Máquina de follow-up (rotina de vendas)

* 24h sem contato → lembrete
* 48h → mensagem + tarefa
* 7 dias parado → requalificação automática

### 3.3 Visitas e propostas

* Stage “Visita”:

  * cria checklist
  * agenda (Google Calendar)
  * envia confirmação + rota
* Stage “Proposta”:

  * gera PDF
  * envia e registra envio
  * avisa gestor

### 3.4 Pós-venda e indicação

* Quando “Won”:

  * cria pasta do negócio
  * checklist de documentação
  * retornos 7/30/90 dias
  * pedir indicação com script

### 3.5 Financeiro (quando ERP existir)

* Quando “Won”:

  * abre conta a receber
  * calcula split
  * agenda previsão
* Vencido:

  * alerta gestor + corretor

### 3.6 Campanhas por imóvel (rotina do marketing operacional)

* Após publicar imóvel:

  * dispara plano “30 dias fortes”
  * cria tarefas diárias/semanais/mensais
  * alerta do dia (tarefas hoje) e atraso

---

## 4) IA (OPERACIONAL + COMERCIAL) — FUNÇÕES PRÁTICAS

### 4.1 IA Operacional (backoffice)

* Triagem de leads (quente/morno/frio)
* Resumo automático do histórico (1 parágrafo por lead)
* Próxima melhor ação (NBA: next best action)
* Alertas inteligentes (lead esfriando)
* Checklist automático por tipo de negócio

### 4.2 IA Comercial (SDR/Closer)

* Scripts de WhatsApp por cenário
* Roteiros de ligação
* Copys de anúncio por imóvel/categoria
* Análise de proposta (riscos, próximos passos)

### 4.3 IA Gestão (você + Alex)

* Daily do gestor (atenção do dia)
* Mapa do funil (gargalos, travas, oportunidades)
* Previsão de receita
* Sugestão de treinamento (onde o time erra)

**Observação importante:** IA não inventa dado — se faltou, abre tarefa e pede.

---

## 5) APP (CAMPO E GESTÃO) — FUNÇÕES DETALHADAS

### 5.1 Campo (corretor na rua)

* Criar lead rápido por voz
* Captar imóvel:

  * fotos/vídeo
  * localização + lat/lng
  * checklist (compliance)
* “Modo visita”:

  * roteiro de visita
  * perguntas
  * notas
* Upload automático de mídia organizado
* Assinatura/termos (fase futura)

### 5.2 Gestão (gestor)

* Painel do dia (leads quentes, atrasos, metas)
* Aprovação de propostas e descontos
* Aprovação de comissões/splits
* Alertas de gargalos

---

## 6) “AGENTE PRINCIPAL VITRYA” + SUBAGENTES

## 6.1 Conceito (Vitrya OS)

Um **Agente Principal** que:

* lê CRM/ERP
* executa ações via n8n
* conversa com time e gestor
* delega para subagentes especializados

O Agente Principal faz 5 coisas:

1. Entender contexto (lead/imóvel/campanha)
2. Priorizar (urgente/importante; “o que destrava hoje”)
3. Executar automações (n8n)
4. Cobrar com processo (SLA; lembretes; follow-up)
5. Gerar relatórios (diário/semana/mês)

## 6.2 Subagentes (estrutura recomendada)

A) Subagente Comercial (SDR/Closer)

* qualificação, scripts, objeções, follow-up, próximos passos

B) Subagente Operações (Backoffice)

* checklists, documentos, pós-venda, auditoria de dados faltantes

C) Subagente Marketing

* roteiros, calendário editorial, copys de imóveis, CTAs por campanha

D) Subagente Financeiro (ERP)

* splits, contas a pagar/receber, alertas, saúde financeira

E) Subagente Produto/Qualidade

* detecta inconsistências, bugs, padrões, “não quebra regras do projeto”

## 6.3 Regras de governo (pra não virar bagunça)

* Comercial: CRM é fonte de verdade
* Dinheiro: ERP é fonte de verdade
* Execução: n8n é motor
* Tudo tem dono e prazo (SLA)
* Toda automação registra log no CRM
* IA não inventa dados

---

## 7) ROADMAP OFICIAL (FASES) — MVP → V1 → V2

### FASE 1 — MVP NÚCLEO (onde estamos hoje)

**Inclui (já implementado):**

* CRM Pessoas (Sprint 1) completo
* CRM Imóveis + aprovação + mídias + documentos (Sprint 4) completo
* Vitrine pública base (Sprint 5) com busca, resultados, detalhe, categorias

**Falta para fechar MVP operacional (prioridades reais):**

1. **Campanhas MVP**

   * `/campaigns` (kanban completo)
   * resumo em “Meus Imóveis” (topo)
   * seção no detalhe do imóvel (CRM)
   * atividades diárias/semanais/mensais/totais (page dedicada)
2. **Dashboard com métricas de campanhas** (cards separados de Leads)
3. **Estabilização + commits + deploy EasyPanel**

   * smoke tests
   * env vars/policies/migrations
   * revisão rotas/guards

---

### FASE 2 — CRM V1 (Operação real com time)

* Leads/Deals robusto:

  * pipeline configurável e refinado (sem scroll lateral)
  * motivos de perda
  * templates e SLAs
* Tarefas e agenda (início)
* Integração n8n com rotina de follow-up
* Cards padrão do CRM (mesmo layout em “todos imóveis”, “meus imóveis”, etc.)
* “Imóveis em destaque” (carrossel no topo em /properties)

---

### FASE 3 — VITRINE V1 (Conversão + corretor público)

* WhatsApp com número real da Vitrya
* Card do corretor responsável no imóvel
* Página pública do corretor + lista de imóveis dele
* Disponível/Reservado/Vendido com regra 7 dias vendido
* Ajustes finais UI (topbar, busca, galeria)

---

### FASE 4 — ERP V1 (Financeiro Vitrya)

* Contas a pagar/receber
* Split e comissão por regra
* Aprovação do gestor
* Fluxo de caixa + DRE + previsões

---

### FASE 5 — n8n (Automação “motor” completo)

* Captura omnichannel
* Follow-up automático
* Pós-venda e indicação
* Campanhas por imóvel (30 dias fortes + manutenção)
* Integração com agenda
* Alertas e relatórios

---

### FASE 6 — IA (Vitrya OS)

* Priorização do dia
* Scripts e mensagens inteligentes
* Resumo e next action
* Alertas e previsões
* Sugestão de treinamentos e melhorias

---

### FASE 7 — App (campo e gestão)

* Captação e visita com checklist
* Upload de mídia estruturado
* Geolocalização + evidências
* Assinatura de termos (fase futura)
* Painel gestor mobile

---

# 8) PLANO UNIFICADO (Sprints) — EXECUÇÃO TÉCNICA ATÉ “TERMINAL”

(para sua planilha de execução)

### Sprint 0 — Estabilização + Deploy base

* padronizar cookies() Next 15/16
* smoke tests + correções
* preparar deploy EasyPanel (env/policies/migrations)
* commits organizados

### Sprint 1 — Pessoas (DONE)

* concluído

### Sprint 2 — Lead → Pessoa/Cliente

* implementar fluxo completo (lead vinculado à pessoa; criação/edição; validações)

### Sprint 3 — Pipelines/Etapas

* refinamento kanban lead (sem ultrapassar laterais; colapsável; contador; hover)

### Sprint 4 — Imóveis CRM (DONE)

* concluído e validado

### Sprint 5 — Vitrine pública (DONE parcial + backlog UI)

* backlog: topbar, busca, galeria, whatsapp real, corretor responsável

### Sprint Campanhas (MVP) — prioridade operacional agora

* `/campaigns` (kanban)
* métricas base por campanha/imóvel
* page de atividades (diária/semanal/mensal/total)
* integração em:

  * topo “Meus Imóveis” (resumo)
  * dentro do imóvel (CRM)

### Sprint Dashboard Campanhas

* cards: atrasadas/hoje/semana/% execução/imóveis sem campanha

### Sprint Status Online/Offline + Disponibilidade

* draft/offline/online
* disponível/reservado/vendido (7 dias online quando vendido)

### Sprint Padronização Cards CRM + Destaques

* cards padrão em todo CRM
* carrossel “destaques” no topo (critério a definir)

### Sprint ERP V1

* financeiro + splits + previsões

### Sprint n8n V1

* captura/follow-up/campanhas/pós-venda/financeiro

### Sprint IA V1

* priorização + scripts + next action + alertas

### Sprint App V1

* captação/visita/checklist/upload

### Sprint Hardening Final (Terminal)

* auditoria de segurança/RLS
* performance
* observabilidade/logs
* backup/restore
* documentação final (runbooks)
* deploy estável + CI/CD

---



* **Kanban de Campanhas**: melhor em `/campaigns` como “área de execução”, com **resumo no topo em Meus Imóveis** e **métricas no Dashboard**.
* Isso evita dispersão e mantém a tela sempre **sem ultrapassar laterais**, só scroll vertical, com navegação objetiva para a página de atividades.


