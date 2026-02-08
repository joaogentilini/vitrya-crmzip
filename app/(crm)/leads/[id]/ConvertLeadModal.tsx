'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'

const CLIENT_TYPES = [
  { value: 'buyer', label: 'Comprador' },
  { value: 'seller', label: 'Vendedor' },
  { value: 'tenant', label: 'Inquilino' },
  { value: 'landlord', label: 'Proprietário' },
  { value: 'investor', label: 'Investidor' },
] as const

interface ConvertLeadModalProps {
  leadId: string
  leadTitle: string
  onClose: () => void
  onSuccess: (clientId: string, personId: string) => void
}

export function ConvertLeadModal({ leadId, leadTitle, onClose, onSuccess }: ConvertLeadModalProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [personType, setPersonType] = useState<'PF' | 'PJ'>('PF')
  const [pfForm, setPfForm] = useState({
    cpf: '',
    rg: '',
    rg_issuing_org: '',
    marital_status: '',
    birth_date: ''
  })
  const [pjForm, setPjForm] = useState({
    cnpj: '',
    legal_name: '',
    trade_name: '',
    state_registration: '',
    municipal_registration: ''
  })

  useEffect(() => {
    const digits = pjForm.cnpj.replace(/\D/g, '')
    if (digits.length === 14 && personType !== 'PJ') {
      setPersonType('PJ')
    }
  }, [pjForm.cnpj, personType])

  const toggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const handleConvert = () => {
    startTransition(async () => {
      try {
        const resp = await fetch(`/api/leads/${leadId}/convert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: selectedTypes,
            personType,
            cpf: pfForm.cpf || null,
            rg: pfForm.rg || null,
            rgIssuingOrg: pfForm.rg_issuing_org || null,
            maritalStatus: pfForm.marital_status || null,
            birthDate: pfForm.birth_date || null,
            cnpj: pjForm.cnpj || null,
            legalName: pjForm.legal_name || null,
            tradeName: pjForm.trade_name || null,
            stateRegistration: pjForm.state_registration || null,
            municipalRegistration: pjForm.municipal_registration || null
          })
        })

        const data = await resp.json()

        if (!resp.ok) {
          throw new Error(data.error || 'Erro ao converter lead')
        }

        success('Lead convertido em cliente!')
        onSuccess(data.client.id, data.person.id)
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao converter lead')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Converter em Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Converter <strong>{leadTitle}</strong> em cliente. Os dados de contato serão vinculados ao cadastro do cliente.
          </p>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Tipos de Cliente (opcional)
            </label>
            <div className="flex flex-wrap gap-2">
              {CLIENT_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleType(value)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    selectedTypes.includes(value)
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-[var(--background)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--primary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Tipo de pessoa
            </label>
            <select
              value={personType}
              onChange={(e) => setPersonType(e.target.value as 'PF' | 'PJ')}
              className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              <option value="PF">PF - Pessoa Física</option>
              <option value="PJ">PJ - Pessoa Jurídica</option>
            </select>
          </div>

          {personType === 'PF' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  CPF
                </label>
                <input
                  type="text"
                  value={pfForm.cpf}
                  onChange={(e) => setPfForm((prev) => ({ ...prev, cpf: e.target.value }))}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  RG
                </label>
                <input
                  type="text"
                  value={pfForm.rg}
                  onChange={(e) => setPfForm((prev) => ({ ...prev, rg: e.target.value }))}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Órgão emissor
                </label>
                <input
                  type="text"
                  value={pfForm.rg_issuing_org}
                  onChange={(e) =>
                    setPfForm((prev) => ({ ...prev, rg_issuing_org: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Estado civil
                </label>
                <input
                  type="text"
                  value={pfForm.marital_status}
                  onChange={(e) =>
                    setPfForm((prev) => ({ ...prev, marital_status: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Nascimento
                </label>
                <input
                  type="text"
                  placeholder="YYYY-MM-DD"
                  value={pfForm.birth_date}
                  onChange={(e) => setPfForm((prev) => ({ ...prev, birth_date: e.target.value }))}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  CNPJ
                </label>
                <input
                  type="text"
                  value={pjForm.cnpj}
                  onChange={(e) => setPjForm((prev) => ({ ...prev, cnpj: e.target.value }))}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Razão social
                </label>
                <input
                  type="text"
                  value={pjForm.legal_name}
                  onChange={(e) => setPjForm((prev) => ({ ...prev, legal_name: e.target.value }))}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Nome fantasia
                </label>
                <input
                  type="text"
                  value={pjForm.trade_name}
                  onChange={(e) => setPjForm((prev) => ({ ...prev, trade_name: e.target.value }))}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  IE
                </label>
                <input
                  type="text"
                  value={pjForm.state_registration}
                  onChange={(e) =>
                    setPjForm((prev) => ({ ...prev, state_registration: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  IM
                </label>
                <input
                  type="text"
                  value={pjForm.municipal_registration}
                  onChange={(e) =>
                    setPjForm((prev) => ({ ...prev, municipal_registration: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose} 
              className="flex-1"
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleConvert} 
              disabled={isPending} 
              className="flex-1"
            >
              {isPending ? 'Convertendo...' : 'Converter'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
