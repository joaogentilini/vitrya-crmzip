# Sprint 0 - Smoke Test Checklist

## Objetivo
Validar funcionalidades críticas do Vitrya CRM após deploy ou aplicação de migrations.

## Pré-requisitos
- [ ] Migrations aplicadas (ver docs/db/MIGRATIONS.md)
- [ ] Variáveis de ambiente configuradas
- [ ] Servidor rodando

## Checklist de Testes

### 1. Autenticação
- [ ] Login com email/senha funciona
- [ ] Usuário inativo é redirecionado para /blocked
- [ ] Logout funciona

### 2. Leads
- [ ] Criar novo lead (título, nome cliente, telefone)
- [ ] Lead aparece na lista
- [ ] Telefone duplicado é bloqueado (E.164)
- [ ] Editar lead funciona

### 3. Kanban
- [ ] Acessar /leads/kanban
- [ ] Pipelines e stages aparecem
- [ ] Arrastar lead entre stages funciona
- [ ] Stage do lead é atualizado

### 4. Catálogos (/settings/catalogs)
- [ ] Listar tipos, interesses, origens
- [ ] Criar novo item
- [ ] Editar item existente
- [ ] Ativar/desativar item

### 5. Usuários (/settings/users)
- [ ] Listar usuários
- [ ] Criar novo usuário (admin apenas)
- [ ] Editar usuário
- [ ] Ativar/desativar usuário
- [ ] Lista recarrega após edição

### 6. Doctor Check (/admin/doctor)
- [ ] Página carrega
- [ ] Mostra resultado do diagnóstico
- [ ] `ok: true` se tudo configurado
- [ ] RequestId aparece nas respostas

### 7. Timeline/Notas
- [ ] Adicionar nota ao lead
- [ ] Nota aparece na timeline
- [ ] Excluir nota funciona

### 8. Conversão Lead → Cliente
- [ ] Converter lead em cliente
- [ ] Cliente é criado com nome correto
- [ ] Lead marcado como convertido

## Validação de Erros

### Teste de Tratamento de Erros
1. Tente criar usuário sem preencher campos
   - [ ] Mensagem de erro amigável aparece
   - [ ] RequestId aparece na resposta de erro

2. Tente acessar rota admin como corretor
   - [ ] Retorna 403 com mensagem clara

3. Verifique logs do servidor
   - [ ] Logs estruturados com requestId
   - [ ] Sem secrets expostos em produção

## Resultado

| Teste | Status | Observações |
|-------|--------|-------------|
| Autenticação | | |
| Leads | | |
| Kanban | | |
| Catálogos | | |
| Usuários | | |
| Doctor | | |
| Timeline | | |
| Conversão | | |

**Data do teste:** ___/___/______

**Testado por:** ________________

**Versão/Commit:** ______________
