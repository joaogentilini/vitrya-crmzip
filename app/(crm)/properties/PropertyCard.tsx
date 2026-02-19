/* eslint-disable @next/next/no-img-element */
'use client'

import React from 'react'

export default function PropertyCard({ property }: { property: any }) {
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

  const openSite = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (typeof window !== 'undefined') {
      window.open(`${siteBase}/imóveis/${property.id}`, '_blank', 'noreferrer')
    }
  }

  const purposeLabel =
    property.purpose === 'sale' ? 'Venda' : property.purpose === 'rent' ? 'Aluguel' : property.purpose

  const location =
    property.city && property.neighborhood
      ? `${property.neighborhood}, ${property.city}`
      : property.address || 'Localização não informada'

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 transition-shadow hover:shadow-md">
      <div className="flex gap-4">
        <div className="h-[68px] w-[92px] shrink-0 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]">
          {property.cover_url ? (
            <img
              src={property.cover_url}
              alt={property.title ? `Capa: ${property.title}` : 'Capa do imóvel'}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-medium text-[var(--muted-foreground)]">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 7h3l2-2h6l2 2h3v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Sem foto</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="truncate text-base font-semibold text-[var(--foreground)]" title={property.title ?? ''}>
              {property.title ?? 'Imóvel'}
            </h3>
            <p className="truncate text-xs text-[var(--muted-foreground)]">{location}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
              {purposeLabel || 'Finalidade'}
            </span>
            <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
              {property.status || 'Status'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {property.price != null ? (
              <p className="text-sm font-semibold text-[var(--foreground)]">
                R$ {Number(property.price).toLocaleString('pt-BR')}
              </p>
            ) : null}

            {property.rent_price != null ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Aluguel: R$ {Number(property.rent_price).toLocaleString('pt-BR')}
              </p>
            ) : null}

            <button
              onClick={openSite}
              type="button"
              className="ml-auto rounded-[var(--radius)] bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
              aria-label="Abrir imóvel na vitrine"
              title="Abrir imóvel no site"
            >
              Ver no site
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
