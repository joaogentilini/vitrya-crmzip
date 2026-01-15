'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsAppShell } from '@/components/SettingsAppShell'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/Toast'

type UserRole = 'admin' | 'gestor' | 'corretor'

interface UserProfile {
  id: string
  full_name: string
  email: string | null
  phone_e164: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

interface UsersClientProps {
  userEmail?: string
  users: UserProfile[]
  currentUserId: string
  currentUserRole: UserRole
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  corretor: 'Corretor'
}

const roleColors: Record<UserRole, string> = {
  admin: 'bg-[#FF681F] text-white',
  gestor: 'bg-[#294487] text-white',
  corretor: 'bg-[var(--muted)] text-[var(--muted-foreground)]'
}

export function UsersClient({ userEmail, users, currentUserId, currentUserRole }: UsersClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterRole, setFilterRole] = useState<string>('')
  const [filterActive, setFilterActive] = useState<string>('')
  const [search, setSearch] = useState('')

  const filteredUsers = users.filter(user => {
    if (filterRole && user.role !== filterRole) return false
    if (filterActive === 'active' && !user.is_active) return false
    if (filterActive === 'inactive' && user.is_active) return false
    if (search) {
      const searchLower = search.toLowerCase()
      if (!user.full_name.toLowerCase().includes(searchLower) &&
          !user.email?.toLowerCase().includes(searchLower)) {
        return false
      }
    }
    return true
  })

  const handleToggleActive = async (userId: string, userName: string, currentActive: boolean) => {
    if (currentActive) {
      const confirmed = confirm(`Deseja desativar "${userName}"?\n\nAo desativar, o usuário será bloqueado e não poderá acessar o sistema.`)
      if (!confirmed) return
    }

    startTransition(async () => {
      try {
        const resp = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !currentActive })
        })
        
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || 'Erro ao atualizar usuário')
        }
        
        success(currentActive ? 'Usuário desativado' : 'Usuário ativado')
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao atualizar usuário')
      }
    })
  }

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    startTransition(async () => {
      try {
        const resp = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole })
        })
        
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || 'Erro ao alterar role')
        }
        
        success('Role alterado com sucesso')
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao alterar role')
      }
    })
  }

  const handleResetPassword = async (userId: string, email: string) => {
    if (!confirm(`Enviar email de redefinição de senha para ${email}?`)) return
    
    startTransition(async () => {
      try {
        const resp = await fetch(`/api/admin/users/${userId}/reset-password`, {
          method: 'POST'
        })
        
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || 'Erro ao enviar email')
        }
        
        success('Email de redefinição enviado')
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao enviar email')
      }
    })
  }

  return (
    <SettingsAppShell userEmail={userEmail} pageTitle="Usuários">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Usuários</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Gerencie usuários e permissões do sistema
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Usuário
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">Todos os Roles</option>
                <option value="admin">Administrador</option>
                <option value="gestor">Gestor</option>
                <option value="corretor">Corretor</option>
              </select>
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Usuário</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Role</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Status</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Criado em</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent)]/50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-[var(--foreground)]">{user.full_name}</p>
                          <p className="text-sm text-[var(--muted-foreground)]">{user.email}</p>
                          {user.phone_e164 && (
                            <p className="text-xs text-[var(--muted-foreground)]">{user.phone_e164}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {currentUserRole === 'admin' && user.id !== currentUserId ? (
                          <select
                            value={user.role}
                            onChange={(e) => handleChangeRole(user.id, e.target.value as UserRole)}
                            disabled={isPending}
                            className="h-8 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-2 text-sm"
                          >
                            <option value="corretor">Corretor</option>
                            <option value="gestor">Gestor</option>
                            <option value="admin">Administrador</option>
                          </select>
                        ) : (
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${roleColors[user.role]}`}>
                            {roleLabels[user.role]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          user.is_active 
                            ? 'bg-[var(--success)]/10 text-[var(--success)]' 
                            : 'bg-[var(--destructive)]/10 text-[var(--destructive)]'
                        }`}>
                          {user.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--muted-foreground)]">
                          {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {user.id !== currentUserId && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleActive(user.id, user.full_name, user.is_active)}
                                disabled={isPending}
                              >
                                {user.is_active ? 'Desativar' : 'Ativar'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => user.email && handleResetPassword(user.id, user.email)}
                                disabled={isPending || !user.email}
                              >
                                Reset Senha
                              </Button>
                            </>
                          )}
                          {user.id === currentUserId && (
                            <span className="text-xs text-[var(--muted-foreground)]">(você)</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                        Nenhum usuário encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {showCreateModal && (
          <CreateUserModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false)
              router.refresh()
            }}
            currentUserRole={currentUserRole}
          />
        )}
      </div>
    </SettingsAppShell>
  )
}

interface CreateUserModalProps {
  onClose: () => void
  onSuccess: () => void
  currentUserRole: UserRole
}

function CreateUserModal({ onClose, onSuccess, currentUserRole }: CreateUserModalProps) {
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    phone_e164: '',
    role: 'corretor' as UserRole
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.full_name || !formData.email || !formData.password) {
      showError('Preencha todos os campos obrigatórios')
      return
    }

    if (formData.password.length < 6) {
      showError('A senha deve ter no mínimo 6 caracteres')
      return
    }

    startTransition(async () => {
      try {
        const resp = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
        
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || 'Erro ao criar usuário')
        }
        
        success('Usuário criado com sucesso')
        onSuccess()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao criar usuário')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Novo Usuário</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="João Silva"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="joao@exemplo.com"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="password">Senha Temporária *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>
            
            <div>
              <Label htmlFor="phone">Telefone (opcional)</Label>
              <Input
                id="phone"
                value={formData.phone_e164}
                onChange={(e) => setFormData(prev => ({ ...prev, phone_e164: e.target.value }))}
                placeholder="+5511999999999"
              />
            </div>
            
            <div>
              <Label htmlFor="role">Role *</Label>
              <select
                id="role"
                value={formData.role}
                onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))}
                className="w-full h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="corretor">Corretor</option>
                <option value="gestor">Gestor</option>
                {currentUserRole === 'admin' && (
                  <option value="admin">Administrador</option>
                )}
              </select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
