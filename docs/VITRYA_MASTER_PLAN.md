# VITRYA – MASTER TECHNICAL REFERENCE

Documento interno técnico.
Finalidade: referência estrutural para execução e direcionamento do Codex.
Não é documento comercial. Não é documentação para cliente.

---

# 0. OBJETIVO

Este documento define:

- Arquitetura real do sistema
- Regras de negócio consolidadas
- Estrutura CRM + ERP + Publicação
- Modelo de Negociações
- Modelo de Incorporação
- Arquitetura futura de Agentes IA
- Direcionamento de evolução

Regra principal:
Nunca implementar funcionalidade nova sem verificar se já existe estrutura equivalente.

---

# 1. ARQUITETURA GERAL

Stack:
- Next.js (App Router)
- Supabase (Postgres + RLS + Storage)
- Tailwind + shadcn
- Server Actions
- Middleware auth

Separação conceitual:

CRM → intenção comercial  
ERP → financeiro e contratos  
Vitrine → exposição pública  
IA → camada de análise e automação  

Regra:
CRM registra intenção.
ERP registra dinheiro.
IA analisa.
Automações executam.

---

# 2. ENTIDADES PRINCIPAIS (MODELO ATUAL)

## 2.1 property

Representa imóvel ou empreendimento.

Relacionamentos:
- property → negotiations
- property → documents
- property → media
- property → development (se incorporação)

## 2.2 people

Pessoa única no sistema.
Pode ser:
- proprietário
- comprador
- locatário
- lead
- fiador

Nunca duplicar pessoa para criar lead.
Lead é estado comercial.

## 2.3 negotiations

Vinculada a:
- property
- people

Representa negociação ativa.

## 2.4 proposals

Subestrutura de negotiation.
Contém valores e condições.

## 2.5 commissions

Criada após negociação aceita.

---

# 3. CADASTRO DE IMÓVEL – ESTRUTURA COMPLETA

## 3.1 Responsáveis

- owner_id (people)
- broker_id (users)
- criação inline permitida

## 3.2 Dados básicos

- reference_code (único)
- title
- property_type (enum)
- status: draft | active | reserved | sold | archived
- tags (array)

## 3.3 Localização

- cep
- street
- number
- complement
- neighborhood
- city
- state
- lat
- lng

## 3.4 Valores

- sale_price
- rent_price
- condo_fee
- iptu
- financial_notes

## 3.5 Medidas

- area_total
- area_private
- area_useful

## 3.6 Características

- bedrooms
- bathrooms
- suites
- parking_spaces
- furnished
- custom_attributes (jsonb)

## 3.7 Conteúdo

- description
- internal_notes

---

# 4. PUBLICAÇÃO – REGRAS

Property só pode ir para ACTIVE se:

- Endereço completo
- Coordenadas válidas
- Pelo menos 1 mídia
- Documento de autorização proprietário

Status técnico não deve ser alterado por label visual.
Frontend mapeia label amigável.

---

# 5. INCORPORAÇÃO (A IMPLEMENTAR)

Quando property_type = empreendimento:

Criar estrutura:

property
  └── development
         └── units

## 5.1 development

Campos:
- name
- construction_company
- launch_date
- delivery_date
- total_units
- status

## 5.2 units

Campos:
- development_id
- unit_number
- floor
- area
- price
- status: available | reserved | sold

Regra:
Venda ocorre na unidade.
Imóvel pai não recebe status sold diretamente.

Necessário:
Modal "Nova Incorporação"
- criar development
- gerar unidades automaticamente

---

# 6. ABA NEGOCIAÇÕES – MODELO DEFINITIVO

Fluxo:

Criar ou vincular pessoa →
Criar negociação →
Criar proposta →

## 6.1 negotiation

Campos:
- property_id
- person_id
- status: draft | sent | accepted | rejected | canceled
- created_by

## 6.2 proposal

Campos:
- negotiation_id
- total_value
- payment_conditions (json)
- status

Status técnico mantido no backend.
Frontend apenas traduz label.

---

# 7. ERP – DIRECIONAMENTO

ERP nasce após negotiation.accepted

Fluxo:

negotiation.accepted →
contract →
commissions →
transactions →
cashflow

Entidades futuras:

- contracts
- commissions
- transactions
- accounts
- dre_entries

Regra:
Negociação ≠ financeiro.

---

# 8. AUTOMAÇÕES

Eventos possíveis:

- Stage visita → criar tarefa
- Proposta enviada → reminder 48h
- Negociação aceita → gerar contrato
- Contrato assinado → gerar comissão
- Comissão paga → atualizar DRE

Camada de automação deve ser desacoplada do frontend.

---

# 9. ARQUITETURA DE AGENTES

Modelo hierárquico:

## 9.1 VITRYA_CORE

Orquestrador.
Não executa regras diretas.

## 9.2 Subagentes

AGENTE_COMERCIAL
- priorização leads
- análise conversão
- sugestão follow-up

AGENTE_CAPTACAO
- valida imóveis incompletos
- checklist publicação
- melhoria de anúncio

AGENTE_FINANCEIRO
- análise fluxo caixa
- previsão comissão
- alerta risco

AGENTE_OPERACIONAL
- monitora SLA
- cria tarefas automáticas

AGENTE_MARKETING
- gera descrição SEO
- gera copy anúncios

Regra:
Agentes nunca acessam DB diretamente.
Devem usar camada de serviço.

---

# 10. REGRAS CRÍTICAS

1. Pessoa é entidade central.
2. Lead não duplica pessoa.
3. ERP só após aceite.
4. Empreendimento vende unidade.
5. Status técnico ≠ label visual.
6. Não criar nova tabela sem validar relacionamento.

---

# 11. ROADMAP PRIORITÁRIO

Atual:
- estabilizar negociações
- finalizar comissão
- validar publicação

Próximo:
- implementar incorporação
- estruturar contratos ERP
- padronizar enums

Futuro:
- camada multiagente
- automações estruturadas
- relatórios estratégicos

---

# 12. INSTRUÇÕES PARA O CODEX

Sempre:

- Ler este documento antes de sugerir arquitetura
- Verificar se estrutura já existe
- Não duplicar entidades
- Manter coerência CRM → ERP
- Perguntar antes de alterar modelo de dados

Objetivo final:
Sistema imobiliário unificado com inteligência operacional embutida.
