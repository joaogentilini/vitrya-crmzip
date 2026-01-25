'use client'

import { useEffect, useState } from 'react'
import CampaignTabClient from './CampaignTabClient'

interface Metrics {
  tasksTotal: number
  doneTotal: number
  pending: number
  overdue: number
  dueToday: number
  dueWeek: number
}

export default function CampaignTab({ propertyId }: { propertyId: string }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/campaigns/property/${propertyId}/metrics`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setMetrics(data)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [propertyId])

  const executionPercent = metrics ? Math.round((metrics.doneTotal / metrics.tasksTotal) * 100) : 0

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="text-sm font-extrabold text-black/90">Campanha</div>
      <div className="mt-1 text-sm text-black/60">
        Acompanhe execução e acesse o Kanban deste imóvel.
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-black/60">Carregando métricas...</div>
      ) : error ? (
        <div className="mt-4 text-sm text-red-600">Erro: {error}</div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
            Execução: {executionPercent}% ({metrics?.doneTotal}/{metrics?.tasksTotal})
          </span>
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
            Pendentes: {metrics?.pending}
          </span>
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
            Atrasadas: {metrics?.overdue}
          </span>
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
            Hoje: {metrics?.dueToday}
          </span>
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
            Semana: {metrics?.dueWeek}
          </span>
        </div>
      )}

      <CampaignTabClient propertyId={propertyId} />
    </div>
  )
}