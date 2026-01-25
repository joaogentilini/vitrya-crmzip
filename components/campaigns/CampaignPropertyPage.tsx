'use client'

import { useRouter } from 'next/navigation'
import type { PropertyRow, TaskAggRow } from '@/app/(crm)/campaigns/page.tsx'

function titleOf(p: PropertyRow) {
  return p.title?.trim() || `Imóvel ${p.id.slice(0, 6)}`
}

function subtitleOf(p: PropertyRow) {
  const cat =
    (p.property_categories && !Array.isArray(p.property_categories)
      ? p.property_categories?.name
      : Array.isArray(p.property_categories)
        ? p.property_categories?.[0]?.name
        : null) ?? null

  const parts = [cat, p.neighborhood, p.city].filter(Boolean)
  return parts.join(' • ') || '—'
}

export default function CampaignPropertyCard({
  property,
  agg,
}: {
  property: PropertyRow
  agg?: TaskAggRow
}) {
  const router = useRouter()

  const cover = (property.cover_url || '').trim()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/campaigns/${property.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') router.push(`/campaigns/${property.id}`)
      }}
      className="group cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-3 shadow-sm backdrop-blur transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
    >
      <div className="flex gap-3">
        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-white/5">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">
            {titleOf(property)}
          </div>
          <div className="mt-0.5 truncate text-xs text-white/70">
            {subtitleOf(property)}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/80">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Pendentes: {agg?.pending_total ?? 0}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Atrasadas: {agg?.overdue ?? 0}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Hoje: {agg?.due_today ?? 0}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Semana: {agg?.due_week ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
