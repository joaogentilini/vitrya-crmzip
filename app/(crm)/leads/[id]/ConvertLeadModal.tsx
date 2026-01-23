'use client'

import { useState, useTransition } from 'react'
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
          body: JSON.stringify({ types: selectedTypes })
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
