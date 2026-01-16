'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/Toast'

type UserRole = 'admin' | 'gestor' | 'corretor'

interface Person {
  id: string
  full_name: string
  email: string | null
  phone_e164: string | null
  document_id: string | null
  kind_tags: string[]
  notes: string | null
  owner_profile_id: string | null
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

interface UserProfile {
  id: string
  full_name: string
  role: string
}

interface PeopleClientProps {
  people: Person[]
  currentUserId: string
  currentUserRole: UserRole
  corretores: UserProfile[]
  userEmail?: string | null
}

const kindTagLabels: Record<string, string> = {
  comprador: 'Comprador',
  vendedor: 'Vendedor',
  proprietario: 'Proprietário',
  inquilino: 'Inquilino',
  investidor: 'Investidor',
  fornecedor: 'Fornecedor'
}

const kindTagOptions = [
  { value: 'comprador', label: 'Comprador' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'proprietario', label: 'Proprietário' },
  { value: 'inquilino', label: 'Inquilino' },
  { value: 'investidor', label: 'Investidor' },
  { value: 'fornecedor', label: 'Fornecedor' }
]

export function PeopleClient({ 
  people, 
  currentUserId, 
  currentUserRole,
  corretores,
  userEmail 
}: PeopleClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filterKind, setFilterKind] = useState<string>('')

  const isAdminOrGestor = currentUserRole === 'admin' || currentUserRole === 'gestor'

  const filteredPeople = people.filter(person => {
    if (search) {
      const searchLower = search.toLowerCase()
      if (!person.full_name.toLowerCase().includes(searchLower) &&
          !person.email?.toLowerCase().includes(searchLower) &&
          !person.phone_e164?.includes(search) &&
          !person.document_id?.includes(search)) {
        return false
      }
    }
    if (filterKind && (!person.kind_tags || !person.kind_tags.includes(filterKind))) {
      return false
    }
    return true
  })

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }

  return (
    <AppShell 
      userEmail={userEmail} 
      onSignOut={handleSignOut}
      pageTitle="Pessoas"
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Pessoas</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Cadastro unificado de clientes, proprietários e contatos
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Pessoa
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Buscar por nome, email, telefone ou documento..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value)}
                className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">Todos os Tipos</option>
                {kindTagOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            {filteredPeople.length === 0 ? (
              <div className="text-center py-8 text-[var(--muted-foreground)]">
                {search || filterKind ? 'Nenhuma pessoa encontrada com os filtros aplicados.' : 'Nenhuma pessoa cadastrada ainda.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-3 px-2 font-medium text-[var(--muted-foreground)]">Nome</th>
                      <th className="text-left py-3 px-2 font-medium text-[var(--muted-foreground)]">Contato</th>
                      <th className="text-left py-3 px-2 font-medium text-[var(--muted-foreground)]">Documento</th>
                      <th className="text-left py-3 px-2 font-medium text-[var(--muted-foreground)]">Tipos</th>
                      <th className="text-left py-3 px-2 font-medium text-[var(--muted-foreground)]">Criado em</th>
                      <th className="py-3 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeople.map(person => (
                      <tr key={person.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]/50">
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#294487] flex items-center justify-center text-white text-xs font-semibold">
                              {person.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <span className="font-medium text-[var(--foreground)]">{person.full_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-[var(--muted-foreground)]">
                          {person.phone_e164 && <div>{person.phone_e164}</div>}
                          {person.email && <div className="text-xs">{person.email}</div>}
                        </td>
                        <td className="py-3 px-2 text-[var(--muted-foreground)]">
                          {person.document_id || '-'}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1">
                            {person.kind_tags?.map(tag => (
                              <span 
                                key={tag} 
                                className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]"
                              >
                                {kindTagLabels[tag] || tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-[var(--muted-foreground)]">
                          {new Date(person.created_at).toLocaleDateString('pt-BR')}
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
            )}
          </CardContent>
        </Card>

        <div className="text-sm text-[var(--muted-foreground)]">
          {filteredPeople.length} pessoa{filteredPeople.length !== 1 ? 's' : ''} encontrada{filteredPeople.length !== 1 ? 's' : ''}
        </div>
      </div>

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
    </AppShell>
  )
}

interface CreatePersonModalProps {
  currentUserId: string
  currentUserRole: UserRole
  corretores: UserProfile[]
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
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone_e164: '',
    document_id: '',
    kind_tags: [] as string[],
    notes: '',
    owner_profile_id: currentUserId
  })

  const isAdminOrGestor = currentUserRole === 'admin' || currentUserRole === 'gestor'

  const handleTagToggle = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      kind_tags: prev.kind_tags.includes(tag)
        ? prev.kind_tags.filter(t => t !== tag)
        : [...prev.kind_tags, tag]
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.full_name.trim()) {
      showError('Nome completo é obrigatório')
      return
    }

    startTransition(async () => {
      try {
        const resp = await fetch('/api/people', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            full_name: formData.full_name.trim(),
            email: formData.email.trim() || null,
            phone_e164: formData.phone_e164.trim() || null,
            document_id: formData.document_id.trim() || null,
            notes: formData.notes.trim() || null,
            created_by_profile_id: currentUserId
          })
        })
        
        const data = await resp.json().catch(() => ({ error: 'Erro de comunicação com servidor' }))
        
        if (!resp.ok) {
          const requestId = data.error?.requestId || data.requestId
          const baseMsg = typeof data.error === 'string' ? data.error : (data.error?.message || 'Erro ao criar pessoa')
          const errorMsg = requestId ? `${baseMsg} (ID: ${requestId})` : baseMsg
          throw new Error(errorMsg)
        }
        
        success('Pessoa criada com sucesso')
        onSuccess()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao criar pessoa')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Nova Pessoa</CardTitle>
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
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="joao@exemplo.com"
                />
              </div>
              <div>
                <Label htmlFor="phone_e164">Telefone</Label>
                <Input
                  id="phone_e164"
                  type="tel"
                  value={formData.phone_e164}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone_e164: e.target.value }))}
                  placeholder="+5511999999999"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="document_id">CPF/CNPJ</Label>
              <Input
                id="document_id"
                value={formData.document_id}
                onChange={(e) => setFormData(prev => ({ ...prev, document_id: e.target.value }))}
                placeholder="000.000.000-00"
              />
            </div>

            <div>
              <Label>Tipo de Pessoa</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {kindTagOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleTagToggle(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      formData.kind_tags.includes(opt.value)
                        ? 'bg-[#294487] text-white border-[#294487]'
                        : 'bg-[var(--background)] text-[var(--foreground)] border-[var(--border)] hover:border-[#294487]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {isAdminOrGestor && corretores.length > 0 && (
              <div>
                <Label htmlFor="owner_profile_id">Responsável</Label>
                <select
                  id="owner_profile_id"
                  value={formData.owner_profile_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, owner_profile_id: e.target.value }))}
                  className="w-full h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
                >
                  {corretores.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label htmlFor="notes">Observações</Label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Notas sobre essa pessoa..."
                className="w-full min-h-[80px] rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm resize-y"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Criando...' : 'Criar Pessoa'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
