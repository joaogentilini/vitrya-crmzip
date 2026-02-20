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
  broker_commission_level?: string | null
  broker_commission_percent?: number | null
  company_commission_percent?: number | null
  partner_commission_percent?: number | null
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

const COMMISSION_PRESETS = [
  { label: 'Junior 40/60', level: 'Junior', broker: 40, company: 60, partner: 0 },
  { label: 'Pleno 50/50', level: 'Pleno', broker: 50, company: 50, partner: 0 },
  { label: 'Senior 60/40', level: 'Senior', broker: 60, company: 40, partner: 0 },
] as const

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR')
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return `${value.toFixed(2)}%`
}

function toNumberOr(value: number | null | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value
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

  const totalUsers = users.length
  const activeUsers = users.filter((user) => user.is_active).length
  const brokerUsers = users.filter((user) => user.role === 'corretor').length
  const googleConnectedUsers = users.filter((user) => user.google_calendar.connected).length
  const isFiltering = !!filterRole || !!filterActive || !!search.trim()

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
          const baseMsg = typeof data.error === 'string' ? data.error : (data.error?.message || 'Erro ao alterar cargo')
          const errorMsg = requestId ? `${baseMsg} (ID: ${requestId})` : baseMsg
          throw new Error(errorMsg)
        }
        
        success('Cargo alterado com sucesso')
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao alterar cargo')
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-[var(--muted-foreground)]">Total de usuários</p>
              <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">{totalUsers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-[var(--muted-foreground)]">Ativos</p>
              <p className="mt-1 text-2xl font-bold text-[var(--success)]">{activeUsers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-[var(--muted-foreground)]">Corretores</p>
              <p className="mt-1 text-2xl font-bold text-[#294487]">{brokerUsers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-[var(--muted-foreground)]">Google conectado</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{googleConnectedUsers}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-3 pt-4">
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
                <option value="">Todos os cargos</option>
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
              <Button
                variant="outline"
                onClick={() => {
                  setFilterRole('')
                  setFilterActive('')
                  setSearch('')
                }}
                disabled={!isFiltering}
              >
                Limpar filtros
              </Button>
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              Exibindo {filteredUsers.length} de {totalUsers} usuários
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Usuário</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Cargo</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Comissão</th>
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
                        <div className="space-y-0.5">
                          <p className="font-medium text-[var(--foreground)]">{user.full_name}</p>
                          <p className="text-sm text-[var(--muted-foreground)]">{user.email || '-'}</p>
                          <p className="text-[11px] text-[var(--muted-foreground)]">
                            ID {user.id.slice(0, 8)} | Atualizado {formatDateTime(user.updated_at)}
                          </p>
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
                        {user.role === 'corretor' ? (
                          <div className="space-y-2 text-xs">
                            <div className="inline-flex rounded-full border border-[#294487]/30 bg-[#294487]/10 px-2 py-1 font-semibold text-[#294487]">
                              Nível: {user.broker_commission_level?.trim() || '-'}
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                                Corretor {formatPercent(user.broker_commission_percent)}
                              </span>
                              <span className="inline-flex rounded-full bg-[#FF681F]/15 px-2 py-1 font-semibold text-[#FF681F]">
                                Vitrya {formatPercent(user.company_commission_percent)}
                              </span>
                              <span className="inline-flex rounded-full bg-cyan-100 px-2 py-1 font-semibold text-cyan-700">
                                Parceiro {formatPercent(user.partner_commission_percent)}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--muted-foreground)]">
                              Total{' '}
                              {(
                                toNumberOr(user.broker_commission_percent, 0) +
                                toNumberOr(user.company_commission_percent, 0) +
                                toNumberOr(user.partner_commission_percent, 0)
                              ).toFixed(2)}
                              %
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">-</span>
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
                          {user.google_calendar.connected ? 'Conectada' : 'Não conectada'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--muted-foreground)]">
                          {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
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
                            <span className="text-xs text-[var(--muted-foreground)]">(você)</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
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
    role: 'corretor' as UserRole
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.full_name || !formData.email) {
      showError('Preencha todos os campos obrigatórios')
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

        success('Convite enviado por email com sucesso')
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
              <Label htmlFor="role">Cargo *</Label>
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

            <p className="text-xs text-[var(--muted-foreground)]">
              O usuário receberá um convite por email para definir a senha e concluir o primeiro acesso.
            </p>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending ? 'Enviando convite...' : 'Enviar Convite'}
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
    is_active: user.is_active,
    broker_commission_level: user.broker_commission_level || '',
    broker_commission_percent: Number(user.broker_commission_percent ?? 50),
    company_commission_percent: Number(user.company_commission_percent ?? 50),
    partner_commission_percent: Number(user.partner_commission_percent ?? 0),
  })

  const commissionTotal =
    Number(formData.broker_commission_percent || 0) +
    Number(formData.company_commission_percent || 0) +
    Number(formData.partner_commission_percent || 0)

  const isCommissionRangeValid = [
    Number(formData.broker_commission_percent),
    Number(formData.company_commission_percent),
    Number(formData.partner_commission_percent),
  ].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)

  const isCommissionTotalValid = Math.abs(commissionTotal - 100) <= 0.0001

  const canSave =
    !isPending && (formData.role !== 'corretor' || (isCommissionRangeValid && isCommissionTotalValid))

  const applyCommissionPreset = (preset: (typeof COMMISSION_PRESETS)[number]) => {
    setFormData((prev) => ({
      ...prev,
      broker_commission_level: preset.level,
      broker_commission_percent: preset.broker,
      company_commission_percent: preset.company,
      partner_commission_percent: preset.partner,
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.full_name.trim()) {
      showError('Nome completo e obrigatório')
      return
    }

    if (formData.role === 'corretor') {
      const broker = Number(formData.broker_commission_percent)
      const company = Number(formData.company_commission_percent)
      const partner = Number(formData.partner_commission_percent)
      const parts = [broker, company, partner]

      if (parts.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
        showError('Percentuais de comissão devem estar entre 0 e 100.')
        return
      }

      const total = broker + company + partner
      if (Math.abs(total - 100) > 0.0001) {
        showError('A soma de Corretor + Vitrya + Parceiro deve ser 100%.')
        return
      }
    }

    startTransition(async () => {
      try {
        const commissionPayload =
          formData.role === 'corretor'
            ? {
                broker_commission_level: formData.broker_commission_level.trim() || null,
                broker_commission_percent: Number(formData.broker_commission_percent),
                company_commission_percent: Number(formData.company_commission_percent),
                partner_commission_percent: Number(formData.partner_commission_percent),
              }
            : {}

        const resp = await fetch(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: formData.full_name.trim(),
            phone_e164: formData.phone_e164.trim() || null,
            role: formData.role,
            is_active: formData.is_active,
            ...commissionPayload,
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
      <Card className="relative z-10 w-full max-w-3xl mx-4">
        <CardHeader>
          <CardTitle>Editar usuário</CardTitle>
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

            {formData.role === 'corretor' ? (
              <div className="rounded-[var(--radius)] border border-[var(--border)] p-3 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[var(--foreground)]">Comissão do corretor</div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Edição exclusiva de gestor/admin. Soma de Corretor + Vitrya + Parceiro deve ser 100%.
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isCommissionTotalValid
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    Total {commissionTotal.toFixed(2)}%
                  </span>
                </div>
                <div>
                  <Label htmlFor="edit_broker_commission_level">Nível do corretor</Label>
                  <Input
                    id="edit_broker_commission_level"
                    value={formData.broker_commission_level}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, broker_commission_level: e.target.value }))
                    }
                    placeholder="Junior, Pleno, Senior..."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {COMMISSION_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyCommissionPreset(preset)}
                      disabled={isPending}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="edit_broker_commission_percent">Corretor (%)</Label>
                    <Input
                      id="edit_broker_commission_percent"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={String(formData.broker_commission_percent)}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          broker_commission_percent: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit_company_commission_percent">Vitrya (%)</Label>
                    <Input
                      id="edit_company_commission_percent"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={String(formData.company_commission_percent)}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          company_commission_percent: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit_partner_commission_percent">Parceiro (%)</Label>
                    <Input
                      id="edit_partner_commission_percent"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={String(formData.partner_commission_percent)}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          partner_commission_percent: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </div>
                </div>
                {!isCommissionRangeValid ? (
                  <p className="text-xs text-[var(--destructive)]">
                    Percentuais inválidos: use apenas valores entre 0 e 100.
                  </p>
                ) : null}
                {!isCommissionTotalValid ? (
                  <p className="text-xs text-amber-700">Ajuste os campos para fechar exatamente 100%.</p>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[var(--muted)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--ring)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--success)]"></div>
                <span className="ml-3 text-sm font-medium text-[var(--foreground)]">Usuário ativo</span>
              </label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSave} className="flex-1">
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
      showError('Conecte a Google Agenda antes de salvar preferências.')
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
              : data.error?.message || 'Falha ao atualizar integração Google.'
          throw new Error(baseMsg)
        }

        success('Preferências da integração Google atualizadas.')
        onSuccess()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Falha ao atualizar integração Google.')
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
                {user.google_calendar.connected ? 'Conectada' : 'Não conectada'}
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
              Última atualização: {formatDateTime(user.google_calendar.updated_at)}
            </p>
            {user.google_calendar.last_error ? (
              <p className="text-xs text-[var(--destructive)] mt-1">
                Ultimo erro: {user.google_calendar.last_error}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] p-3">
              <span className="text-sm text-[var(--foreground)]">Sincronização ativa</span>
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
      showError('A senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      showError('As senhas não conferem.')
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

