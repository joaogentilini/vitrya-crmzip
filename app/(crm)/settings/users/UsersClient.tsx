'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsAppShell } from '@/components/SettingsAppShell'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/Toast'

type UserRole = 'admin' | 'gestor' | 'corretor'

interface GoogleCalendarSummary {
  connected: boolean
  google_email: string | null
  sync_enabled: boolean
  auto_create_from_tasks: boolean
  connected_at: string | null
  updated_at: string | null
  last_error: string | null
}

interface UserProfile {
  id: string
  full_name: string
  email: string | null
  phone_e164: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
  google_calendar: GoogleCalendarSummary
}

interface UsersClientProps {
  userEmail?: string
  users: UserProfile[]
  currentUserId: string
  currentUserRole: UserRole
  googleStatus?: string | null
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

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR')
}

export function UsersClient({
  userEmail,
  users,
  currentUserId,
  currentUserRole,
  googleStatus,
}: UsersClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [googleUser, setGoogleUser] = useState<UserProfile | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<UserProfile | null>(null)
  const [filterRole, setFilterRole] = useState<string>('')
  const [filterActive, setFilterActive] = useState<string>('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!googleStatus) return

    if (googleStatus === 'connected') {
      success('Google Agenda conectada com sucesso.')
    } else if (googleStatus === 'error') {
      showError('Falha ao conectar Google Agenda.')
    }

    router.replace('/settings/users')
  }, [googleStatus, success, showError, router])

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
          const data = await resp.json().catch(() => ({}))
          const requestId = data.error?.requestId || data.requestId
          const baseMsg = typeof data.error === 'string' ? data.error : (data.error?.message || 'Erro ao atualizar usuário')
          const errorMsg = requestId ? `${baseMsg} (ID: ${requestId})` : baseMsg
          throw new Error(errorMsg)
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
          const data = await resp.json().catch(() => ({}))
          const requestId = data.error?.requestId || data.requestId
          const baseMsg = typeof data.error === 'string' ? data.error : (data.error?.message || 'Erro ao alterar role')
          const errorMsg = requestId ? `${baseMsg} (ID: ${requestId})` : baseMsg
          throw new Error(errorMsg)
        }
        
        success('Role alterado com sucesso')
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao alterar role')
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
                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Google Agenda</th>
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
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            user.google_calendar.connected
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                          }`}
                        >
                          {user.google_calendar.connected ? 'Conectada' : 'Nao conectada'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--muted-foreground)]">
                          {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setGoogleUser(user)}
                            disabled={isPending}
                          >
                            Google
                          </Button>
                          {user.id !== currentUserId && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingUser(user)}
                                disabled={isPending}
                              >
                                Editar
                              </Button>
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
                                onClick={() => setResetPasswordUser(user)}
                                disabled={isPending}
                              >
                                Nova Senha
                              </Button>
                            </>
                          )}
                          {user.id === currentUserId && (
                            <span className="text-xs text-[var(--muted-foreground)]">(voce)</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                        Nenhum usuario encontrado
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
              router.refresh()
              setTimeout(() => setShowCreateModal(false), 100)
            }}
            currentUserRole={currentUserRole}
          />
        )}

        {editingUser && (
          <EditUserModal
            user={editingUser}
            onClose={() => setEditingUser(null)}
            onSuccess={() => {
              router.refresh()
              setTimeout(() => setEditingUser(null), 100)
            }}
            currentUserRole={currentUserRole}
          />
        )}

        {googleUser && (
          <UserGoogleIntegrationModal
            user={googleUser}
            onClose={() => setGoogleUser(null)}
            onSuccess={() => {
              router.refresh()
              setTimeout(() => setGoogleUser(null), 100)
            }}
          />
        )}

        {resetPasswordUser && (
          <ResetPasswordModal
            user={resetPasswordUser}
            onClose={() => setResetPasswordUser(null)}
            onSuccess={() => {
              router.refresh()
              setTimeout(() => setResetPasswordUser(null), 100)
            }}
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
        
        const data = await resp.json().catch(() => ({ error: 'Erro de comunicação com servidor' }))
        
        if (!resp.ok) {
          const requestId = data.error?.requestId || data.requestId
          const baseMsg = typeof data.error === 'string' ? data.error : (data.error?.message || data.details || 'Erro ao criar usuário')
          const errorMsg = requestId ? `${baseMsg} (ID: ${requestId})` : baseMsg
          throw new Error(errorMsg)
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

interface EditUserModalProps {
  user: UserProfile
  onClose: () => void
  onSuccess: () => void
  currentUserRole: UserRole
}

function EditUserModal({ user, onClose, onSuccess, currentUserRole }: EditUserModalProps) {
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    full_name: user.full_name,
    phone_e164: user.phone_e164 || '',
    role: user.role,
    is_active: user.is_active
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.full_name.trim()) {
      showError('Nome completo é obrigatório')
      return
    }

    startTransition(async () => {
      try {
        const resp = await fetch(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: formData.full_name.trim(),
            phone_e164: formData.phone_e164.trim() || null,
            role: formData.role,
            is_active: formData.is_active
          })
        })
        
        const data = await resp.json().catch(() => ({ error: 'Erro de comunicação com servidor' }))
        
        if (!resp.ok) {
          console.error('[EditUserModal] Error updating user:', {
            status: resp.status,
            statusText: resp.statusText,
            body: data
          })
          const requestId = data.error?.requestId || data.requestId
          const baseMsg = typeof data.error === 'string' ? data.error : (data.error?.message || 'Erro ao atualizar usuário')
          const errorMsg = requestId ? `${baseMsg} (ID: ${requestId})` : baseMsg
          throw new Error(errorMsg)
        }
        
        success('Usuário atualizado com sucesso')
        onSuccess()
      } catch (err) {
        console.error('[EditUserModal] Exception:', err)
        showError(err instanceof Error ? err.message : 'Erro ao atualizar usuário')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Editar Usuário</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="edit_full_name">Nome Completo *</Label>
              <Input
                id="edit_full_name"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="João Silva"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="edit_phone">Telefone</Label>
              <Input
                id="edit_phone"
                type="tel"
                value={formData.phone_e164}
                onChange={(e) => setFormData(prev => ({ ...prev, phone_e164: e.target.value }))}
                placeholder="+5511999999999"
              />
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Formato E.164 (ex: +5511999999999)</p>
            </div>
            
            <div>
              <Label htmlFor="edit_role">Cargo *</Label>
              <select
                id="edit_role"
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

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[var(--muted)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--ring)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--success)]"></div>
                <span className="ml-3 text-sm font-medium text-[var(--foreground)]">Usuário Ativo</span>
              </label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

interface UserGoogleIntegrationModalProps {
  user: UserProfile
  onClose: () => void
  onSuccess: () => void
}

function UserGoogleIntegrationModal({ user, onClose, onSuccess }: UserGoogleIntegrationModalProps) {
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [syncEnabled, setSyncEnabled] = useState(user.google_calendar.sync_enabled)
  const [autoCreateFromTasks, setAutoCreateFromTasks] = useState(
    user.google_calendar.auto_create_from_tasks
  )

  const handleSavePreferences = () => {
    if (!user.google_calendar.connected) {
      showError('Conecte a Google Agenda antes de salvar preferencias.')
      return
    }

    startTransition(async () => {
      try {
        const resp = await fetch(`/api/admin/users/${user.id}/google-calendar`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sync_enabled: syncEnabled,
            auto_create_from_tasks: autoCreateFromTasks,
          }),
        })

        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          const baseMsg =
            typeof data.error === 'string'
              ? data.error
              : data.error?.message || 'Falha ao atualizar integracao Google.'
          throw new Error(baseMsg)
        }

        success('Preferencias da integracao Google atualizadas.')
        onSuccess()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Falha ao atualizar integracao Google.')
      }
    })
  }

  const handleDisconnect = () => {
    if (!confirm(`Desconectar Google Agenda de ${user.full_name}?`)) return

    startTransition(async () => {
      try {
        const resp = await fetch(`/api/admin/users/${user.id}/google-calendar`, {
          method: 'DELETE',
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          const baseMsg =
            typeof data.error === 'string'
              ? data.error
              : data.error?.message || 'Falha ao desconectar Google Agenda.'
          throw new Error(baseMsg)
        }

        success('Google Agenda desconectada.')
        onSuccess()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Falha ao desconectar Google Agenda.')
      }
    })
  }

  const handleConnect = () => {
    const returnTo = encodeURIComponent('/settings/users')
    const targetUserId = encodeURIComponent(user.id)
    window.location.href = `/api/integrations/google/connect?targetUserId=${targetUserId}&returnTo=${returnTo}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-xl mx-4">
        <CardHeader>
          <CardTitle>Google Agenda - {user.full_name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm text-[var(--foreground)]">
            <p>
              Status:{' '}
              <span className="font-medium">
                {user.google_calendar.connected ? 'Conectada' : 'Nao conectada'}
              </span>
            </p>
            <p>
              Conta Google:{' '}
              <span className="font-medium">{user.google_calendar.google_email || '-'}</span>
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Conectada em: {formatDateTime(user.google_calendar.connected_at)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Ultima atualizacao: {formatDateTime(user.google_calendar.updated_at)}
            </p>
            {user.google_calendar.last_error ? (
              <p className="text-xs text-[var(--destructive)] mt-1">
                Ultimo erro: {user.google_calendar.last_error}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] p-3">
              <span className="text-sm text-[var(--foreground)]">Sincronizacao ativa</span>
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => setSyncEnabled(e.target.checked)}
                disabled={isPending}
              />
            </label>
            <label className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] p-3">
              <span className="text-sm text-[var(--foreground)]">Criar eventos automaticamente das tarefas</span>
              <input
                type="checkbox"
                checked={autoCreateFromTasks}
                onChange={(e) => setAutoCreateFromTasks(e.target.checked)}
                disabled={isPending}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleConnect} disabled={isPending}>
              {user.google_calendar.connected ? 'Reconectar Google' : 'Conectar Google'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSavePreferences}
              disabled={isPending || !user.google_calendar.connected}
            >
              Salvar Preferencias
            </Button>
            {user.google_calendar.connected ? (
              <Button type="button" variant="destructive" onClick={handleDisconnect} disabled={isPending}>
                Desconectar
              </Button>
            ) : null}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface ResetPasswordModalProps {
  user: UserProfile
  onClose: () => void
  onSuccess: () => void
}

function ResetPasswordModal({ user, onClose, onSuccess }: ResetPasswordModalProps) {
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword.length < 6) {
      showError('A senha deve ter no minimo 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      showError('As senhas nao conferem.')
      return
    }

    startTransition(async () => {
      try {
        const resp = await fetch(`/api/admin/users/${user.id}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword }),
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          const baseMsg =
            typeof data.error === 'string'
              ? data.error
              : data.error?.message || 'Falha ao redefinir senha.'
          throw new Error(baseMsg)
        }

        success('Senha atualizada no app com sucesso.')
        onSuccess()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Falha ao redefinir senha.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Nova Senha - {user.full_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="new_password">Nova senha</Label>
              <Input
                id="new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirm_password">Confirmar nova senha</Label>
              <Input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending ? 'Salvando...' : 'Atualizar Senha'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
