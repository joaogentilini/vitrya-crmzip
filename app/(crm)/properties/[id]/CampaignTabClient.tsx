'use client'

import { useEffect, useState } from 'react'
import CampaignDetailPage from '@/app/(crm)/campaigns/[propertyId]/CampaignPropertyPage'
import type { CampaignTask } from '@/app/(crm)/campaigns/types'
import type { PropertyRow } from '@/app/(crm)/campaigns/page'

type CampaignPayload = {
  property: PropertyRow
  tasks: CampaignTask[]
}

export default function CampaignTabClient({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<CampaignPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetch(`/api/campaigns/property/${propertyId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || 'Erro ao carregar campanha.')
        }
        return res.json()
      })
      .then((payload) => {
        if (!active) return
        setData(payload)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Erro ao carregar campanha.')
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
    <div className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Campanhas do imóvel</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Acompanhe as tarefas e o andamento da campanha deste imóvel.
        </p>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">
          Carregando campanha...
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--destructive)]">
          {error}
        </div>
      ) : data ? (
        <CampaignDetailPage property={data.property} tasks={data.tasks} />
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">
          Nenhuma campanha encontrada para este imóvel.
        </div>
      )}
    </div>
  )
}
