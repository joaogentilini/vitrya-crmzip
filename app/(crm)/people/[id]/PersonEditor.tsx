'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { updatePerson, UpdatePersonData } from './actions'

interface Person {
  id: string
  full_name: string
  phone_e164: string | null
  email: string | null
  document_id: string | null
  notes: string | null
  kind_tags: string[] | null
  owner_profile_id: string | null
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
}

interface PersonEditorProps {
  person: Person
  ownerProfile?: { id: string; full_name: string | null; email: string | null } | null
  creatorProfile?: { id: string; full_name: string | null; email: string | null } | null
}

const kindTagLabels: Record<string, string> = {
  comprador: 'Comprador',
  vendedor: 'Vendedor',
  proprietario: 'Proprietário',
  inquilino: 'Inquilino',
  investidor: 'Investidor',
  fornecedor: 'Fornecedor'
}

const availableTags = Object.keys(kindTagLabels)

export default function PersonEditor({ person, ownerProfile, creatorProfile }: PersonEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<UpdatePersonData>({
    full_name: person.full_name,
    phone_e164: person.phone_e164 || '',
    email: person.email || '',
    document_id: person.document_id || '',
    notes: person.notes || '',
    kind_tags: person.kind_tags || []
  })

  const handleSave = async () => {
    setLoading(true)
    setError(null)

    try {
      await updatePerson(person.id, formData)
      setIsEditing(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      full_name: person.full_name,
      phone_e164: person.phone_e164 || '',
      email: person.email || '',
      document_id: person.document_id || '',
      notes: person.notes || '',
      kind_tags: person.kind_tags || []
    })
    setIsEditing(false)
    setError(null)
  }

  const handleTagToggle = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      kind_tags: prev.kind_tags?.includes(tag)
        ? prev.kind_tags.filter(t => t !== tag)
        : [...(prev.kind_tags || []), tag]
    }))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#294487] flex items-center justify-center text-white text-lg font-semibold">
              {person.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  className="text-xl font-bold bg-transparent border-b border-gray-300 focus:border-[#294487] focus:outline-none"
                  placeholder="Nome completo"
                />
              ) : (
                <h1 className="text-xl font-bold">{person.full_name}</h1>
              )}
              <div className="flex flex-wrap gap-1 mt-1">
                {formData.kind_tags?.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]"
                  >
                    {kindTagLabels[tag] || tag}
                  </span>
                ))}
              </div>
            </div>
          </CardTitle>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  onClick={handleSave}
                  disabled={loading}
                  className="bg-[#294487] hover:bg-[#1e3366] text-white"
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setIsEditing(true)}
                className="bg-[#294487] hover:bg-[#1e3366] text-white"
              >
                Editar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-[var(--muted-foreground)] mb-1">Nome Completo</p>
            {isEditing ? (
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                className="text-sm font-medium text-[var(--foreground)] w-full border border-gray-300 rounded px-2 py-1 focus:border-[#294487] focus:outline-none"
                placeholder="Nome completo"
              />
            ) : (
              <p className="text-sm font-medium text-[var(--foreground)]">{person.full_name}</p>
            )}
          </div>

          <div>
            <p className="text-xs text-[var(--muted-foreground)] mb-1">Telefone</p>
            {isEditing ? (
              <input
                type="text"
                value={formData.phone_e164}
                onChange={(e) => setFormData(prev => ({ ...prev, phone_e164: e.target.value }))}
                className="text-sm font-medium text-[var(--foreground)] w-full border border-gray-300 rounded px-2 py-1 focus:border-[#294487] focus:outline-none"
                placeholder="+55 11 99999-9999"
              />
            ) : (
              <p className="text-sm font-medium text-[var(--foreground)]">{person.phone_e164 || '—'}</p>
            )}
          </div>

          <div>
            <p className="text-xs text-[var(--muted-foreground)] mb-1">Email</p>
            {isEditing ? (
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="text-sm font-medium text-[var(--foreground)] w-full border border-gray-300 rounded px-2 py-1 focus:border-[#294487] focus:outline-none"
                placeholder="email@exemplo.com"
              />
            ) : (
              <p className="text-sm font-medium text-[var(--foreground)]">{person.email || '—'}</p>
            )}
          </div>

          <div>
            <p className="text-xs text-[var(--muted-foreground)] mb-1">CPF/CNPJ</p>
            {isEditing ? (
              <input
                type="text"
                value={formData.document_id}
                onChange={(e) => setFormData(prev => ({ ...prev, document_id: e.target.value }))}
                className="text-sm font-medium text-[var(--foreground)] w-full border border-gray-300 rounded px-2 py-1 focus:border-[#294487] focus:outline-none"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
              />
            ) : (
              <p className="text-sm font-medium text-[var(--foreground)]">{person.document_id || '—'}</p>
            )}
          </div>

          {ownerProfile && (
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Responsável</p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {ownerProfile.full_name || ownerProfile.email || '—'}
              </p>
            </div>
          )}

          {creatorProfile && (
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Criado por</p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {creatorProfile.full_name || creatorProfile.email || '—'}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs text-[var(--muted-foreground)] mb-1">Cadastrado em</p>
            <p className="text-sm font-medium text-[var(--foreground)]">
              {new Date(person.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">Tags/Categorias</p>
          {isEditing ? (
            <div className="flex flex-wrap gap-2">
              {availableTags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagToggle(tag)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    formData.kind_tags?.includes(tag)
                      ? 'bg-[#294487] text-white border-[#294487]'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#294487]'
                  }`}
                >
                  {kindTagLabels[tag]}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {person.kind_tags?.map((tag: string) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]"
                >
                  {kindTagLabels[tag] || tag}
                </span>
              )) || <span className="text-sm text-gray-500">Nenhuma tag definida</span>}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted-foreground)] mb-1">Observações</p>
          {isEditing ? (
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="text-sm text-[var(--foreground)] w-full border border-gray-300 rounded px-2 py-1 focus:border-[#294487] focus:outline-none min-h-[80px]"
              placeholder="Observações sobre a pessoa..."
            />
          ) : (
            <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">
              {person.notes || 'Nenhuma observação'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}