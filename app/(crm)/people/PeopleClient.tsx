'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

interface Profile {
  id: string
  full_name: string | null
}

interface Person {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  created_at: string
  user_id: string
}

interface PeopleClientProps {
  people: Person[]
  corretores: Profile[]
  selectedBroker?: string
  currentUserId: string
  currentUserRole: 'admin' | 'gestor' | 'corretor'
}

export function PeopleClient({ 
  people,
  corretores,
  selectedBroker, 
  currentUserId, 
  currentUserRole 
}: PeopleClientProps) {
  const router = useRouter()
  const { success } = useToast()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'created_at'>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const handleBrokerChange = (brokerId: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set('broker', brokerId)
    router.push(`/people?${params.toString()}`)
  }

  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'gestor'

  const filteredPeople = people
    .filter(person => {
      if (!searchTerm) return true
      const searchLower = searchTerm.toLowerCase()
      return (
        person.full_name?.toLowerCase().includes(searchLower) ||
        person.email?.toLowerCase().includes(searchLower) ||
        person.phone?.includes(searchTerm)
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
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-3 px-2 text-sm font-medium text-[var(--muted-foreground)]">Nome</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-[var(--muted-foreground)]">Contato</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-[var(--muted-foreground)]">Data de Cadastro</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-[var(--muted-foreground)]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeople.map((person) => (
                      <tr key={person.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]">
                        <td className="py-3 px-2">
                          <div className="font-medium text-[var(--foreground)]">
                            {person.full_name || 'Nome não informado'}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <div className="text-sm text-[var(--muted-foreground)] space-y-1">
                            {person.email && <div>{person.email}</div>}
                            {person.phone && <div>{person.phone}</div>}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <div className="text-sm text-[var(--muted-foreground)]">
                            {new Date(person.created_at).toLocaleDateString('pt-BR')}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <Link 
                            href={`/people/${person.id}`}
                            className="text-[#294487] hover:underline text-sm"
                          >
                            Ver
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
        phone: phone.trim() || null,
        user_id: assignedTo || currentUserId,
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

          {(currentUserRole === 'admin' || currentUserRole === 'manager') && corretores.length > 0 && (
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
