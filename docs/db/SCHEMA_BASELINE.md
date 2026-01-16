# Vitrya CRM - Schema Baseline

> **Última atualização:** 2026-01-16  
> **Fonte de verdade executável:** `docs/migrations/20260116_fix_schema_stabilization.sql`

Este documento descreve o schema atual do banco de dados do Vitrya CRM de forma legível. Para recriar ou atualizar o banco, use sempre as migrations SQL oficiais.

---

## Tabelas Principais

| Tabela | Finalidade |
|--------|-----------|
| `profiles` | Usuários do sistema (vinculado a auth.users) |
| `pipelines` | Pipelines de vendas/locação |
| `pipeline_stages` | Etapas de cada pipeline (colunas do Kanban) |
| `leads` | Leads/oportunidades de negócio |
| `lead_types` | Catálogo de tipos de lead (Compra, Venda, etc) |
| `lead_interests` | Catálogo de interesses (Apartamento, Casa, etc) |
| `lead_sources` | Catálogo de origens (Site, Indicação, etc) |
| `lead_notes` | Notas/comentários em leads |
| `lead_audit_logs` | Histórico de alterações em leads |
| `tasks` | Tarefas associadas a leads |
| `people` | Cadastro unificado de pessoas |
| `clients` | Clientes (pessoa convertida de lead) |

---

## Detalhamento por Tabela

### profiles
Usuários do sistema, vinculados a `auth.users` do Supabase.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Referência a auth.users(id) |
| `full_name` | text | Nome completo |
| `email` | text | Email |
| `phone_e164` | text | Telefone formato E.164 |
| `role` | text | Papel: admin, gestor, corretor |
| `is_active` | boolean | Usuário ativo? |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última atualização |

**FK:** `id → auth.users(id) ON DELETE CASCADE`

---

### pipelines
Pipelines de vendas ou locação.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `name` | text | Nome do pipeline |
| `type` | text | Tipo: sales, rent |
| `description` | text | Descrição opcional |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última atualização |

**Check:** `type IN ('sales', 'rent')`

---

### pipeline_stages
Etapas de cada pipeline (colunas do Kanban).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `pipeline_id` | uuid FK | Pipeline pai |
| `name` | text | Nome da etapa |
| `position` | integer | Ordem de exibição |
| `created_at` | timestamptz | Data de criação |

**FK:** `pipeline_id → pipelines(id) ON DELETE CASCADE`

---

### leads
Leads/oportunidades de negócio.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `title` | text | Título/nome do lead |
| `status` | text | Status: open, won, lost |
| `pipeline_id` | uuid FK | Pipeline atual |
| `stage_id` | uuid FK | Etapa atual no pipeline |
| `owner_user_id` | uuid FK | Proprietário do lead |
| `user_id` | uuid | Usuário legado (deprecated) |
| `assigned_to` | uuid FK | Responsável atribuído |
| `created_by` | uuid FK | Quem criou |
| `client_name` | text | Nome do cliente |
| `phone_raw` | text | Telefone como digitado |
| `phone_e164` | text | Telefone normalizado E.164 |
| `email` | text | Email do cliente |
| `lead_type_id` | uuid FK | Tipo (catálogo) |
| `lead_interest_id` | uuid FK | Interesse (catálogo) |
| `lead_source_id` | uuid FK | Origem (catálogo) |
| `budget_range` | text | Faixa de orçamento |
| `notes` | text | Observações |
| `person_id` | uuid FK | Pessoa vinculada |
| `client_id` | uuid FK | Cliente (após conversão) |
| `is_converted` | boolean | Lead convertido? |
| `converted_at` | timestamptz | Data de conversão |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última atualização |

**FKs:**
- `pipeline_id → pipelines(id) ON DELETE SET NULL`
- `stage_id → pipeline_stages(id) ON DELETE SET NULL`
- `owner_user_id → profiles(id) ON DELETE SET NULL`
- `assigned_to → profiles(id) ON DELETE SET NULL`
- `created_by → profiles(id) ON DELETE SET NULL`
- `lead_type_id → lead_types(id) ON DELETE SET NULL`
- `lead_interest_id → lead_interests(id) ON DELETE SET NULL`
- `lead_source_id → lead_sources(id) ON DELETE SET NULL`
- `person_id → people(id) ON DELETE SET NULL`
- `client_id → clients(id) ON DELETE SET NULL`

**Índices:**
- `leads_phone_e164_unique` - Único parcial em phone_e164 (WHERE NOT NULL)
- `leads_pipeline_id_idx` - Index em pipeline_id
- `leads_stage_id_idx` - Index em stage_id
- `leads_status_idx` - Index em status
- `leads_owner_user_id_idx` - Index em owner_user_id

---

### lead_types / lead_interests / lead_sources
Catálogos configuráveis (estrutura idêntica).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `name` | text UNIQUE | Nome do item |
| `position` | integer | Ordem de exibição |
| `is_active` | boolean | Item ativo? |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última atualização |

**Constraint:** `name` é UNIQUE em cada tabela

---

### lead_notes
Notas/comentários em leads.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `lead_id` | uuid FK | Lead associado |
| `user_id` | uuid FK | Autor da nota |
| `content` | text | Conteúdo da nota |
| `created_at` | timestamptz | Data de criação |

**FKs:**
- `lead_id → leads(id) ON DELETE CASCADE`
- `user_id → profiles(id) ON DELETE CASCADE`

---

### lead_audit_logs
Histórico de alterações em leads (timeline).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `lead_id` | uuid FK | Lead associado |
| `actor_id` | uuid FK | Quem fez a ação |
| `action` | text | Tipo de ação |
| `before` | jsonb | Estado anterior |
| `after` | jsonb | Estado posterior |
| `details` | jsonb | Detalhes extras |
| `created_at` | timestamptz | Data da ação |

**FKs:**
- `lead_id → leads(id) ON DELETE CASCADE`
- `actor_id → profiles(id) ON DELETE SET NULL`

**Índices:**
- `lead_audit_logs_lead_id_idx`
- `lead_audit_logs_created_at_idx` (DESC)

---

### tasks
Tarefas associadas a leads.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `lead_id` | uuid FK | Lead associado |
| `title` | text | Título da tarefa |
| `type` | text | Tipo (follow_up, etc) |
| `status` | text | Status: open, completed, cancelled |
| `due_at` | timestamptz | Data de vencimento |
| `notes` | text | Observações |
| `assigned_to` | uuid FK | Responsável |
| `created_by` | uuid FK | Quem criou |
| `created_at` | timestamptz | Data de criação |
| `completed_at` | timestamptz | Data de conclusão |

**FKs:**
- `lead_id → leads(id) ON DELETE CASCADE`
- `assigned_to → profiles(id) ON DELETE SET NULL`
- `created_by → profiles(id) ON DELETE SET NULL`

**Índices:**
- `tasks_lead_id_idx`
- `tasks_status_idx`
- `tasks_due_at_idx`

---

### people
Cadastro unificado de pessoas (clientes, proprietários, fornecedores, etc).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `full_name` | text NOT NULL | Nome completo |
| `phone_e164` | text | Telefone E.164 |
| `email` | text | Email |
| `document_id` | text | CPF/CNPJ ou documento |
| `kind_tags` | text[] | Tipos: comprador, vendedor, proprietario, inquilino, investidor, fornecedor |
| `notes` | text | Observações |
| `owner_profile_id` | uuid FK | Responsável/corretor (carteira) |
| `created_by_profile_id` | uuid FK | Quem criou |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última atualização |

**FKs:**
- `owner_profile_id → profiles(id) ON DELETE SET NULL`
- `created_by_profile_id → profiles(id) ON DELETE SET NULL`

**Índices:**
- `idx_people_phone_e164`
- `idx_people_email`
- `idx_people_owner_profile_id`
- `idx_people_created_by_profile_id`
- `idx_people_document_id`

---

### clients
Clientes (pessoas convertidas de lead).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `person_id` | uuid FK UNIQUE | Pessoa associada |
| `owner_user_id` | uuid FK | Proprietário/corretor |
| `status` | text | Status: active, inactive |
| `types` | text[] | Tipos de relacionamento |
| `notes` | text | Observações |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última atualização |

**FKs:**
- `person_id → people(id) ON DELETE RESTRICT`
- `owner_user_id → profiles(id) ON DELETE RESTRICT`

**Constraint:** `clients_person_id_unique` (uma pessoa = um cliente)

**Índices:**
- `idx_clients_owner_user_id`
- `idx_clients_status`

---

## Triggers

| Tabela | Trigger | Função | Descrição |
|--------|---------|--------|-----------|
| `leads` | `set_updated_at_leads` | `trigger_set_updated_at()` | Atualiza updated_at |
| `profiles` | `set_updated_at_profiles` | `trigger_set_updated_at()` | Atualiza updated_at |
| `lead_types` | `set_updated_at_lead_types` | `trigger_set_updated_at()` | Atualiza updated_at |
| `lead_interests` | `set_updated_at_lead_interests` | `trigger_set_updated_at()` | Atualiza updated_at |
| `lead_sources` | `set_updated_at_lead_sources` | `trigger_set_updated_at()` | Atualiza updated_at |
| `clients` | `set_updated_at_clients` | `trigger_set_updated_at()` | Atualiza updated_at |
| `people` | `set_updated_at_people` | `trigger_set_updated_at()` | Atualiza updated_at |

**Observação:** Todos os triggers usam cláusula `WHEN` para evitar recursão (só disparam quando campos relevantes mudam).

---

## Funções

| Função | Descrição |
|--------|-----------|
| `trigger_set_updated_at()` | Atualiza campo updated_at para NOW() |
| `vitrya_doctor()` | Verifica integridade do schema (tabelas, colunas, triggers, RLS) |

---

## Row Level Security (RLS)

Todas as tabelas sensíveis têm RLS habilitado:

| Tabela | RLS | Políticas |
|--------|-----|-----------|
| `profiles` | ✅ | Todos lêem, usuário edita próprio, admin insere |
| `leads` | ✅ | Admin/gestor vê todos, corretor vê próprios |
| `lead_notes` | ✅ | Segue ownership do lead |
| `lead_audit_logs` | ✅ | Segue ownership do lead |
| `tasks` | ✅ | Segue ownership do lead ou assigned_to |
| `people` | ✅ | Admin/gestor vê todos, corretor vê carteira própria |
| `clients` | ✅ | Owner ou admin/gestor |
| `pipelines` | ✅ | Todos lêem, admin gerencia |
| `pipeline_stages` | ✅ | Todos lêem, admin gerencia |
| `lead_types` | ✅ | Todos lêem, admin modifica |
| `lead_interests` | ✅ | Todos lêem, admin modifica |
| `lead_sources` | ✅ | Todos lêem, admin modifica |

### Resumo de Políticas por Role

| Role | leads | profiles | pipelines | catalogs |
|------|-------|----------|-----------|----------|
| **admin** | CRUD todos | Lê todos, edita próprio, cria novos | CRUD | CRUD |
| **gestor** | CRUD todos | Lê todos, edita próprio | Lê | Lê |
| **corretor** | CRUD próprios | Lê todos, edita próprio | Lê | Lê |

---

## Seed Data Padrão

### Pipelines
- `Pipeline de Vendas` (type: sales)
- `Pipeline de Locação` (type: rent)

### Stages (Pipeline de Vendas)
1. Novo
2. Contato
3. Qualificação
4. Proposta
5. Negociação

### Stages (Pipeline de Locação)
1. Novo
2. Visita
3. Documentação
4. Contrato

### Catálogos

**lead_types:**
- Compra, Venda, Aluguel, Investimento

**lead_interests:**
- Apartamento, Casa, Terreno, Comercial, Rural

**lead_sources:**
- Site, Indicação, Instagram, Facebook, Google, Portal Imobiliário, Outro

---

## Verificação do Schema

Para verificar se o schema está correto, use:

```sql
SELECT vitrya_doctor();
```

Retorna JSON com:
- `ok`: boolean indicando se tudo está correto
- `missing_tables`: tabelas faltando
- `missing_columns`: colunas faltando
- `missing_triggers`: triggers faltando
- `rls_disabled`: tabelas sem RLS
- `notes`: observações/recomendações

Endpoint: `GET /api/admin/doctor` (requer admin ou gestor)
