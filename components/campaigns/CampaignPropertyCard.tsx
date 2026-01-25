'use client'

import { useRouter } from 'next/navigation'
import type { PropertyRow, TaskAggRow } from '@/app/(crm)/campaigns/page'

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
    onKeyDown={(e) =>
      e.key === 'Enter' || e.key === ' ' ? router.push(`/campaigns/${property.id}`) : null
    }
    className="group cursor-pointer rounded-3xl border border-black/10 bg-white p-3 shadow-sm transition hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-black/10"
  >
    <div className="flex gap-3">
      <div className="h-16 w-20 shrink-0 overflow-hidden rounded-2xl bg-black/5">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-black/10 to-transparent" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-black/90">
          {titleOf(property)}
        </div>
        <div className="mt-0.5 truncate text-xs text-black/60">
          {subtitleOf(property)}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full border border-black/10 bg-black/5 px-2 py-1 text-[11px] text-black/70">
            Pend.: {agg?.pending_total ?? 0}
          </span>
          <span className="rounded-full border border-black/10 bg-black/5 px-2 py-1 text-[11px] text-black/70">
            Atras.: {agg?.overdue ?? 0}
          </span>
          <span className="rounded-full border border-black/10 bg-black/5 px-2 py-1 text-[11px] text-black/70">
            Hoje: {agg?.due_today ?? 0}
          </span>
          <span className="rounded-full border border-black/10 bg-black/5 px-2 py-1 text-[11px] text-black/70">
            Semana: {agg?.due_week ?? 0}
          </span>
        </div>
      </div>
    </div>
  </div>
  )
}
