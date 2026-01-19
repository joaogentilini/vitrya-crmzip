# DB_RULES — Vitrya (Banco, RLS, Migrations, Storage)

Este documento define padrões obrigatórios para banco de dados Supabase:
- nomenclatura real do schema
- políticas RLS por ownership
- migrations e triggers
- storage (bucket e paths)

---

## 1) Regras Fixas (NÃO NEGOCIÁVEIS)

### 1.1 Ownership (padrão do projeto)
- Coluna oficial de ownership: `owner_user_id`
- Admin ativo vê tudo
- Usuário vê somente registros onde `owner_user_id = auth.uid()`

### 1.2 NÃO usar tenant por enquanto
- `public.pipelines` NÃO tem `tenant_id`
- Não aplicar policies por tenant neste momento
- O modelo atual é por ownership

### 1.3 NÃO usar nomes inexistentes
- Nunca usar `owner_profile_id` (não existe)
- Em `public.properties` NÃO existe `state`

---

## 2) Schema Confirmado (Resumo)

### 2.1 public.pipelines (confirmado)
Colunas principais:
- id uuid
- name text
- type text
- slug text
- owner_user_id uuid
- created_by uuid
- created_at timestamptz
- updated_at timestamptz

### 2.2 public.leads (confirmado)
Ownership e operação:
- owner_user_id uuid (ownership/RLS)
- assigned_to uuid (responsável comercial)
- created_by uuid
- user_id uuid (não usar como padrão de ownership)
- owner_id uuid (legado/evitar)
Relacionamentos:
- pipeline_id uuid
- stage_id uuid
- person_id uuid
- client_id uuid
- property_id uuid
Campos:
- name, email, phone, phone_e164, notes, status etc.

### 2.3 public.properties (confirmado)
NOT NULL:
- id uuid
- status text
- purpose text
- title text
- created_at timestamptz
- updated_at timestamptz

Nullable:
- description text
- city text
- neighborhood text
- address text
- price numeric
- rent_price numeric
- area_m2 numeric
- bedrooms int
- bathrooms int
- parking int
- owner_client_id uuid
- owner_user_id uuid
- created_by uuid

Observação:
- NÃO existe `state`

---

## 3) RLS — Políticas Padrão (Ownership)

### 3.1 Admin ativo
Admin = `profiles.role = 'admin'` AND `profiles.is_active = true`

### 3.2 Policies padrão
- pipelines: no mínimo SELECT (admin ou owner_user_id)
- leads: SELECT/INSERT/UPDATE/DELETE (admin ou owner_user_id)
- properties: SELECT/INSERT/UPDATE/DELETE (admin ou owner_user_id)
- property_media: admin ou owner do property (via join)

### 3.3 Inserção segura (evitar erro 500)
Sempre garantir que `owner_user_id` seja preenchido no INSERT:
- preferir trigger para preencher `owner_user_id = auth.uid()` quando vier null
- além disso, policy de INSERT deve exigir owner_user_id = auth.uid()

---

## 4) Triggers padrão (recomendados)

### 4.1 set_updated_at()
- Toda tabela principal deve manter `updated_at` coerente (trigger)
- Não atualizar updated_at no front manualmente se houver trigger

### 4.2 set_owner_user_id_on_insert() (recomendado)
Para tabelas: leads, properties, pipelines (se criar via app)
- Se `NEW.owner_user_id` for null, preencher com `auth.uid()`

---

## 5) Status Machines (Padrões)

### 5.1 Leads (exemplo)
- open / won / lost (conforme schema atual)

### 5.2 Properties (padrão recomendado)
- draft → pending → approved → active
No momento, se o schema tiver apenas `draft` e `active`, manter:
- draft → active
Regra:
- somente gestor/admin aprova/publica

---

## 6) Storage — Mídia de Imóveis (padrão Vitrya)

Bucket:
- `property-media` (privado)

Path obrigatório:
- `properties/<property_id>/<uuid>-<filename>`

Tabela:
- `public.property_media`:
  - id uuid
  - property_id uuid (FK)
  - url text (guardar o path no bucket)
  - kind text (image|video)
  - position int
  - created_at timestamptz

RLS da property_media:
- admin ativo vê tudo
- usuário vê/insere/edita/deleta se for owner do property (join em properties.owner_user_id)

Policies storage.objects:
- permitir select/insert/update/delete apenas se:
  - admin ativo
  - OU owner do property (derivar property_id do path)

---

## 7) Migrations — Padrão de Arquivo e Processo

### 7.1 Nome do arquivo
`supabase/migrations/YYYYMMDD_HHMM_<descricao>.sql`

### 7.2 Regras
- preferir criar nova migration em vez de editar migration já aplicada
- usar `drop policy if exists` antes de `create policy`
- criar índices para colunas de join e ownership (`owner_user_id`, `property_id`)
- manter SQL "plug and play" e idempotente quando possível

---

## 8) Checklist de validação (DB)

Antes de dizer "OK":
1) RLS habilitado nas tabelas alvo
2) policies existem e não referenciam colunas inexistentes
3) inserts funcionam sem erro 500 (owner_user_id preenchido)
4) queries básicas:
   - lead create
   - lead move stage (timeline sem duplicar)
   - property create (mínimo)
   - property publish (status update)
   - property_media upload/list/delete (quando Sprint 4.8)
EOF