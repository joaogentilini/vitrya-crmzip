/* eslint-disable @next/next/no-img-element */
'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import AdminDeleteActionButton from '@/components/admin/AdminDeleteActionButton'
import { normalizePersonKindTags, PersonKindTag } from '@/lib/types/people2'
import { deletePersonAction } from '../pessoas/[id]/actions'

interface Profile {
  id: string
  full_name: string | null
}

interface Person {
  id: string
  full_name: string | null
  email: string | null
  phone_e164: string | null
  kind_tags?: string[] | null
  avatar_path?: string | null
  created_at: string
}

interface PeopleClientProps {
  people: Person[]
  corretores: Profile[]
  selectedBroker?: string
  currentUserId: string
  currentUserRole: 'admin' | 'gestor' | 'corretor'
  basePath?: string
  documentsBasePath?: string
}

export function PeopleClient({ 
  people,
  corretores,
  selectedBroker, 
  currentUserId, 
  currentUserRole,
  basePath = '/people',
  documentsBasePath
}: PeopleClientProps) {
  const router = useRouter()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'created_at'>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const handleBrokerChange = (brokerId: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set('broker', brokerId)
    router.push(`${basePath}?${params.toString()}`)
  }

  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'gestor'
  const canDelete = currentUserRole === 'admin'

  const filteredPeople = useMemo(() => {
    return people
      .filter(person => {
        if (!searchTerm) return true
        const searchLower = searchTerm.toLowerCase()
        return (
          person.full_name?.toLowerCase().includes(searchLower) ||
          person.email?.toLowerCase().includes(searchLower) ||
          person.phone_e164?.includes(searchTerm)
        )
      })
      .sort((a, b) => {
        let aValue: string | number
        let bValue: string | number

        if (sortBy === 'name') {
          aValue = a.full_name || ''
          bValue = b.full_name || ''
        } else {
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortOrder === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue)
        }

        return sortOrder === 'asc'
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number)
      })
  }, [people, searchTerm, sortBy, sortOrder])

  const kindTagLabels: Record<PersonKindTag, string> = {
    proprietario: 'Proprietário',
    corretor: 'Corretor',
    fornecedor: 'Fornecedor',
    parceiro: 'Parceiro',
    interessado_comprador: 'Interessado/Comprador'
  }

  const getInitials = (name?: string | null) => {
    const trimmed = name?.trim()
    if (!trimmed) return '?'
    const parts = trimmed.split(/\s+/).slice(0, 2)
    return parts.map((part) => part[0]?.toUpperCase()).join('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pessoas</h1>

        {isAdmin && corretores.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-[var(--muted-foreground)]">Filtrar por corretor:</label>
            <select
              value={selectedBroker || 'all'}
              onChange={(e) => handleBrokerChange(e.target.value)}
              className="px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="all">Todos</option>
              {corretores.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar por nome, email ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [field, order] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder]
            setSortBy(field)
            setSortOrder(order)
          }}
          className="px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          <option value="created_at-desc">Mais recentes</option>
          <option value="created_at-asc">Mais antigos</option>
          <option value="name-asc">Nome A-Z</option>
          <option value="name-desc">Nome Z-A</option>
        </select>
        <Button onClick={() => setShowCreateModal(true)}>
          Adicionar Pessoa
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {filteredPeople.length === 0 ? (
            <div className="text-center py-8">
                <p className="text-[var(--muted-foreground)]">
                {people.length === 0 ? 'Nenhuma pessoa cadastrada ainda.' : 'Nenhum resultado encontrado.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredPeople.map((person) => {
                const roles = normalizePersonKindTags(person.kind_tags)
                const contact = person.phone_e164 || person.email || '—'
                return (
                  <div
                    key={person.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`${basePath}/${person.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        router.push(`${basePath}/${person.id}`)
                      }
                    }}
                    className="group flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:bg-[var(--accent)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--muted)] text-[var(--foreground)]">
                        {person.avatar_path ? (
                          <img
                            src={person.avatar_path}
                            alt={person.full_name || 'Pessoa'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-semibold">
                            {getInitials(person.full_name)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                          {person.full_name || 'Nome não informado'}
                        </p>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          {contact}
                        </p>
                      </div>
                    </div>

                    {roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]"
                          >
                            {kindTagLabels[role]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[var(--muted-foreground)]">Sem papéis</p>
                    )}

                    <div className="mt-auto flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
                      <span>{new Date(person.created_at).toLocaleDateString('pt-BR')}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            router.push(`${documentsBasePath ?? basePath}/${person.id}/documents`)
                          }}
                          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          Documentos
                        </button>
                        {canDelete ? (
                          <AdminDeleteActionButton
                            action={deletePersonAction.bind(null, person.id)}
                            confirmMessage="Deseja excluir esta pessoa? Esta acao remove dados vinculados e nao pode ser desfeita."
                            successMessage="Pessoa excluida com sucesso."
                            fallbackErrorMessage="Nao foi possivel excluir a pessoa."
                            size="sm"
                            label="Excluir"
                            stopPropagation
                            onSuccess={() => router.refresh()}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="text-sm text-[var(--muted-foreground)]">
            {filteredPeople.length} pessoa{filteredPeople.length !== 1 ? 's' : ''} encontrada{filteredPeople.length !== 1 ? 's' : ''}
          </div>
        </CardContent>
      </Card>

      {showCreateModal && (
        <CreatePersonModal
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          corretores={corretores}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            setTimeout(() => router.refresh(), 100)
          }}
        />
      )}
    </div>
  )
}

interface CreatePersonModalProps {
  currentUserId: string
  currentUserRole: string
  corretores: Profile[]
  onClose: () => void
  onSuccess: () => void
}

function CreatePersonModal({ 
  currentUserId, 
  currentUserRole, 
  corretores, 
  onClose, 
  onSuccess 
}: CreatePersonModalProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { success, error } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) return

    setIsLoading(true)
    try {
      const personData = {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone_e164: phone.trim() || null,
        owner_profile_id: assignedTo || currentUserId,
        created_by_profile_id: currentUserId,
      }

      const { error: insertError } = await supabase
        .from('people')
        .insert([personData])

      if (insertError) throw insertError

      success('Pessoa criada com sucesso!')
      onSuccess()
    } catch (err) {
      console.error('Error creating person:', err)
      error('Erro ao criar pessoa')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--card)] rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Adicionar Pessoa</h3>
          <button
            onClick={onClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Nome Completo *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Telefone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>

          {(currentUserRole === 'admin' || currentUserRole === 'gestor') && corretores.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Atribuir para
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="">Você mesmo</option>
                {corretores.map((corretor) => (
                  <option key={corretor.id} value={corretor.id}>
                    {corretor.full_name || corretor.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" loading={isLoading} className="flex-1">
              Criar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
