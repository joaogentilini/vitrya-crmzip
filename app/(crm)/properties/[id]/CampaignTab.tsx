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

function getDaysSince(value?: string | null) {
  if (!value) return null
  const start = new Date(value)
  if (Number.isNaN(start.getTime())) return null
  const diff = Date.now() - start.getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export default function CampaignTab({
  propertyId,
  propertyStatus,
  propertyCreatedAt,
}: {
  propertyId: string
  propertyStatus?: string | null
  propertyCreatedAt?: string | null
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/campaigns/property/${propertyId}/metrics`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setMetrics(data)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [propertyId])

  const executionPercent = metrics ? Math.round((metrics.doneTotal / metrics.tasksTotal) * 100) : 0
  const publicationDays = getDaysSince(propertyCreatedAt)
  const publicationLabel =
    propertyStatus === 'active'
      ? publicationDays === null
        ? 'Tempo de publicacao sem data'
        : `${publicationDays} dia${publicationDays === 1 ? '' : 's'} de publicacao`
      : 'Imovel nao publicado'

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="text-sm font-extrabold text-black/90">Campanha</div>
      <div className="mt-1 text-sm text-black/60">Acompanhe execucao e acesse o Kanban deste imovel.</div>

      <div className="mt-3">
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold ${
            propertyStatus === 'active'
              ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
              : 'border-black/10 bg-black/5 text-black/70'
          }`}
        >
          Tempo de publicacao: {publicationLabel}
        </span>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-black/60">Carregando metricas...</div>
      ) : error ? (
        <div className="mt-4 text-sm text-red-600">Erro: {error}</div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
            Execucao: {executionPercent}% ({metrics?.doneTotal}/{metrics?.tasksTotal})
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
