'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

import { reserveUnitAction } from '../actions'
import type { IncorporationUnitVm, ReservationLeadOptionVm } from './types'

type ReserveFeedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function isReserveDisabled(status: string): boolean {
  return status === 'sold' || status === 'blocked'
}

export default function IncorporationUnitDrawerClient({
  open,
  unit,
  incorporationId,
  canReserve,
  leadOptions,
  onClose,
  onReserved,
}: {
  open: boolean
  unit: IncorporationUnitVm | null
  incorporationId: string
  canReserve: boolean
  leadOptions: ReservationLeadOptionVm[]
  onClose: () => void
  onReserved: (payload: { unitId: string; reservationId: string; expiresAt: string }) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<ReserveFeedback>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')
  const [clientNote, setClientNote] = useState<string>('')

  useEffect(() => {
    setFeedback(null)
    setSelectedLeadId('')
    setClientNote('')
  }, [unit?.id])

  const reserveBlocked = useMemo(() => {
    if (!unit) return true
    if (!canReserve) return true
    return isReserveDisabled(unit.status)
  }, [canReserve, unit])

  if (!open || !unit) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-black/10 bg-white shadow-2xl">
        <div className="flex h-full flex-col">
          <header className="border-b border-black/10 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Unidade
                </p>
                <h3 className="text-xl font-bold text-[var(--foreground)]">{unit.unitCode}</h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Andar {unit.floor} • Coluna {unit.stack}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                aria-label="Fechar"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
                <p className="text-xs text-[var(--muted-foreground)]">Status</p>
                <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{unit.status}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
                <p className="text-xs text-[var(--muted-foreground)]">Valor</p>
                <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{formatCurrency(unit.listPrice)}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
                <p className="text-xs text-[var(--muted-foreground)]">Area</p>
                <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                  {typeof unit.areaM2 === 'number' ? `${unit.areaM2} m²` : '-'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
                <p className="text-xs text-[var(--muted-foreground)]">Tipologia</p>
                <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                  {typeof unit.bedrooms === 'number' ? `${unit.bedrooms} qtos` : '-'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Detalhes da reserva
              </p>
              <div className="mt-2 space-y-1 text-sm">
                <p className="text-[var(--muted-foreground)]">
                  Expira em:{' '}
                  <span className="font-medium text-[var(--foreground)]">
                    {formatDateTime(unit.reservationExpiresAt)}
                  </span>
                </p>
                <p className="text-[var(--muted-foreground)]">
                  Reserva instantanea valida por <span className="font-medium text-[var(--foreground)]">30 minutos</span>.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Cliente da reserva
              </p>
              <select
                value={selectedLeadId}
                onChange={(event) => setSelectedLeadId(event.target.value)}
                className="h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
              >
                <option value="">Selecionar lead/cliente (opcional)</option>
                {leadOptions.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.clientName}
                    {lead.phone ? ` - ${lead.phone}` : ''}
                  </option>
                ))}
              </select>
              <input
                value={clientNote}
                onChange={(event) => setClientNote(event.target.value)}
                placeholder="Observação privada (não visível para outros corretores)"
                className="h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
              />
              <p className="text-[11px] text-[var(--muted-foreground)]">
                O cliente vinculado fica restrito ao corretor da reserva e gestores/admin.
              </p>
            </div>

            {!canReserve ? (
              <Badge variant="warning">Somente corretores internos podem reservar</Badge>
            ) : null}

            {feedback ? (
              <div
                className={`rounded-[var(--radius)] border px-3 py-2 text-sm ${
                  feedback.kind === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {feedback.message}
              </div>
            ) : null}
          </div>

          <footer className="border-t border-black/10 p-4">
            <Button
              type="button"
              disabled={reserveBlocked || isPending}
              className="w-full"
              onClick={() => {
                if (reserveBlocked || isPending) return

                startTransition(async () => {
                  setFeedback(null)
                  const result = await reserveUnitAction({
                    unitId: unit.id,
                    leadId: selectedLeadId || null,
                    clientNote: clientNote || null,
                    incorporationId,
                  })

                  if (!result.success) {
                    setFeedback({ kind: 'error', message: result.error })
                    return
                  }

                  setFeedback({
                    kind: 'success',
                    message: 'Reserva realizada com sucesso.',
                  })
                  onReserved({
                    unitId: result.data.unitId,
                    reservationId: result.data.reservationId,
                    expiresAt: result.data.expiresAt,
                  })
                })
              }}
            >
              {isPending ? 'Reservando...' : 'Reservar unidade'}
            </Button>
            {isReserveDisabled(unit.status) ? (
              <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
                Unidade indisponivel para nova reserva.
              </p>
            ) : null}
          </footer>
        </div>
      </aside>
    </>
  )
}
