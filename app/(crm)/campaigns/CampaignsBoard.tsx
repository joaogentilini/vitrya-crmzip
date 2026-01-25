'use client'

import { useMemo, useState } from 'react'
import CampaignPropertyCard from '@/components/campaigns/CampaignPropertyCard'
import type { PropertyRow, TaskAggRow } from './page'

export default function CampaignsBoard({
  properties,
  aggs,
}: {
  properties: PropertyRow[]
  aggs: TaskAggRow[]
}) {
  const [q, setQ] = useState('')
  const aggMap = useMemo(() => new Map(aggs.map((a) => [a.property_id, a])), [aggs])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return properties

    return properties.filter((p) => {
      const cat =
        p.property_categories && !Array.isArray(p.property_categories)
          ? p.property_categories?.name
          : Array.isArray(p.property_categories)
            ? p.property_categories?.[0]?.name
            : null

      const hay = [p.title, p.city, p.neighborhood, cat, p.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return hay.includes(s)
    })
  }, [properties, q])

  const summary = useMemo(() => {
    let overdue = 0
    let dueToday = 0
    let dueWeek = 0
    let pending = 0

    for (const p of filtered) {
      const a = aggMap.get(p.id)
      if (!a) continue
      overdue += a.overdue
      dueToday += a.due_today
      dueWeek += a.due_week
      pending += a.pending_total
    }

    return { overdue, dueToday, dueWeek, pending }
  }, [filtered, aggMap])

  return (
    <div className="space-y-4">
      {/* Barra de controle premium */}
      <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div className="flex-1">
      <div className="text-sm font-semibold text-black/90">Visão geral</div>

      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/80">
          Pendentes: {summary.pending}
        </span>
        <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/80">
          Atrasadas: {summary.overdue}
        </span>
        <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/80">
          Hoje: {summary.dueToday}
        </span>
        <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/80">
          Semana: {summary.dueWeek}
        </span>
      </div>
    </div>

    <div className="w-full md:w-[360px]">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por título, bairro, cidade, categoria..."
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm text-black placeholder:text-black/40 outline-none focus:ring-2 focus:ring-black/10"
      />
    </div>
  </div>
</div>


      {/* Grid premium, cards menores */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 shadow-sm backdrop-blur">
            Nenhum imóvel encontrado para essa busca.
          </div>
        ) : (
          filtered.map((p) => (
            <CampaignPropertyCard key={p.id} property={p} agg={aggMap.get(p.id)} />
          ))
        )}
      </div>
    </div>
  )
}
