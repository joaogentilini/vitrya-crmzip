'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { getPropertyLeads } from '../actions'

type LeadRow = {
  id: string
  title?: string | null
  status?: string | null
  value_estimate?: number | null
  created_at?: string | null
  stage_id?: string | null
  person_id?: string | null
  name?: string | null
  phone_e164?: string | null
  email?: string | null
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function PropertyNegotiationsTab({ propertyId }: { propertyId: string }) {
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    getPropertyLeads(propertyId)
      .then((data) => {
        if (!active) return
        setLeads(data as LeadRow[])
      })
      .catch((err) => {
        if (!active) return
        const message = err instanceof Error ? err.message : 'Erro ao carregar negociações.'
        setError(message)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [propertyId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Negociações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">Carregando negociações...</p>
        ) : error ? (
          <p className="text-sm text-[var(--destructive)]">{error}</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhuma negociação encontrada.</p>
        ) : (
          <div className="space-y-2">
            {leads.map((lead) => {
              const title =
                lead.title ||
                lead.name ||
                lead.email ||
                lead.phone_e164 ||
                `Lead ${lead.id.slice(0, 6)}`
              return (
                <div
                  key={lead.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--foreground)]">{title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(lead.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--muted-foreground)]">{lead.status || '—'}</p>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {formatCurrency(lead.value_estimate)}
                    </p>
                  </div>
                  <div>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="text-xs font-medium text-[var(--primary)] hover:underline"
                    >
                      Abrir lead
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
