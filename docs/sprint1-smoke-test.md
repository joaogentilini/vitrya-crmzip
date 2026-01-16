# Sprint 1 - Smoke Test (Pessoas)

## Pré-requisitos

1. Executar migration `supabase/migrations/20260116_2117_extend_people_table.sql` no Supabase SQL Editor
2. Servidor dev rodando (`npm run dev`)

---

## Testes de Admin

### 1. Listar Pessoas
- [ ] Acessar `/people`
- [ ] Verificar que a lista carrega (pode estar vazia)
- [ ] Verificar busca por nome funciona
- [ ] Verificar filtro por tipo funciona

### 2. Criar Pessoa
- [ ] Clicar em "Nova Pessoa"
- [ ] Preencher:
  - Nome Completo: "João Teste Admin"
  - Email: joao@teste.com
  - Telefone: +5511999999999
  - CPF/CNPJ: 123.456.789-00
  - Tipo: Comprador, Investidor
  - Responsável: (selecionar qualquer corretor)
- [ ] Clicar "Criar Pessoa"
- [ ] Verificar toast de sucesso
- [ ] Verificar pessoa aparece na lista

### 3. Visualizar Pessoa
- [ ] Clicar em "Ver" na pessoa criada
- [ ] Verificar que todos os campos aparecem corretamente:
  - Nome
  - Telefone
  - Email
  - CPF/CNPJ
  - Tipos (badges)
  - Responsável
  - Criado por
  - Data de cadastro

### 4. Menu Lateral
- [ ] Verificar que "Pessoas" aparece no menu lateral
- [ ] Clicar no link e verificar navegação

---

## Testes de Corretor

### 1. RLS - Ver Apenas Próprias Pessoas
- [ ] Logar como corretor
- [ ] Acessar `/people`
- [ ] Verificar que só aparecem pessoas onde:
  - owner_profile_id = id do corretor, OU
  - created_by_profile_id = id do corretor

### 2. Criar Pessoa como Corretor
- [ ] Criar nova pessoa
- [ ] Verificar que:
  - owner_profile_id é setado automaticamente para o corretor
  - created_by_profile_id é setado automaticamente para o corretor
- [ ] Verificar que a pessoa aparece na lista

### 3. Não Ver Pessoas de Outros
- [ ] Como admin, criar pessoa com owner = outro corretor
- [ ] Logar como corretor original
- [ ] Verificar que a pessoa do outro corretor NÃO aparece

---

## Testes de Erro

### 1. Nome Obrigatório
- [ ] Tentar criar pessoa sem nome
- [ ] Verificar mensagem de erro

### 2. Erro de Servidor (simular)
- [ ] Forçar erro (ex: colunas inexistentes no banco se migration não aplicada)
- [ ] Verificar que requestId aparece no toast de erro

---

## Checklist Final

- [ ] Build passa sem erros (`npm run build`)
- [ ] Nenhum erro no console do servidor
- [ ] Nenhum erro no console do navegador
- [ ] Menu "Pessoas" funciona
- [ ] CRUD básico funciona
- [ ] RLS respeita roles

---

## Migrations para Aplicar

```bash
# No SQL Editor do Supabase:
supabase/migrations/20260116_2117_extend_people_table.sql
```
