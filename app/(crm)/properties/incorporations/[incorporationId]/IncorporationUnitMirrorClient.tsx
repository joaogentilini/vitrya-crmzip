'use client'

import { Fragment, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'

import IncorporationUnitDrawerClient from './IncorporationUnitDrawerClient'
import type { IncorporationUnitVm, ReservationLeadOptionVm } from './types'

function formatShortCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`
  return `R$ ${value.toFixed(0)}`
}

function statusClass(status: string): string {
  if (status === 'available') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'reserved') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'sold') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

function compareStacks(a: string, b: string): number {
  const aNum = Number(a)
  const bNum = Number(b)
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

function normalizeTower(value: string | null | undefined): string {
  return String(value || 'SEM BLOCO').trim().toUpperCase() || 'SEM BLOCO'
}

export default function IncorporationUnitMirrorClient({
  incorporationId,
  initialUnits,
  canReserve,
  viewerId,
  leadOptions,
}: {
  incorporationId: string
  initialUnits: IncorporationUnitVm[]
  canReserve: boolean
  viewerId: string | null
  leadOptions: ReservationLeadOptionVm[]
}) {
  const [units, setUnits] = useState<IncorporationUnitVm[]>(initialUnits)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [showBlocked, setShowBlocked] = useState(false)

  const towers = useMemo(() => {
    return Array.from(new Set(units.map((unit) => normalizeTower(unit.tower)))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    )
  }, [units])

  const [selectedTower, setSelectedTower] = useState<string>(towers[0] || 'SEM BLOCO')

  const towerUnits = useMemo(
    () => units.filter((unit) => normalizeTower(unit.tower) === selectedTower),
    [selectedTower, units]
  )

  const visibleUnits = useMemo(
    () => (showBlocked ? towerUnits : towerUnits.filter((unit) => unit.status !== 'blocked')),
    [towerUnits, showBlocked]
  )

  const floors = useMemo(() => {
    return Array.from(new Set(visibleUnits.map((unit) => unit.floor))).sort((a, b) => b - a)
  }, [visibleUnits])

  const stacks = useMemo(() => {
    return Array.from(new Set(visibleUnits.map((unit) => unit.stack))).sort(compareStacks)
  }, [visibleUnits])

  const unitByKey = useMemo(() => {
    const map = new Map<string, IncorporationUnitVm>()
    for (const unit of visibleUnits) {
      map.set(`${unit.floor}:${unit.stack}`, unit)
    }
    return map
  }, [visibleUnits])

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === selectedUnitId) ?? null,
    [selectedUnitId, units]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-white px-2 py-1">
            <span className="text-[11px] text-[var(--muted-foreground)]">Bloco</span>
            <select
              value={selectedTower}
              onChange={(event) => {
                setSelectedTower(event.target.value)
                setSelectedUnitId(null)
              }}
              className="h-7 rounded border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
            >
              {towers.map((tower) => (
                <option key={tower} value={tower}>
                  {tower}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-white px-2 py-1">
            <input
              type="checkbox"
              checked={showBlocked}
              onChange={(event) => setShowBlocked(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)]"
            />
            <span className="text-[11px] text-[var(--foreground)]">Mostrar bloqueadas</span>
          </label>
        </div>

        <span className="text-[11px] text-[var(--muted-foreground)]">
          Unidades visiveis: <strong className="text-[var(--foreground)]">{visibleUnits.length}</strong>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">Disponível</Badge>
        <Badge className="bg-amber-50 text-amber-700 border border-amber-200">Reservada</Badge>
        <Badge className="bg-sky-50 text-sky-700 border border-sky-200">Vendida</Badge>
        <Badge className="bg-rose-50 text-rose-700 border border-rose-200">Bloqueada</Badge>
      </div>

      {visibleUnits.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted-foreground)]">
          Nenhuma unidade visível neste bloco com os filtros atuais.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-white">
          <div
            className="grid min-w-[760px] gap-2 p-3"
            style={{
              gridTemplateColumns: `120px repeat(${Math.max(stacks.length, 1)}, minmax(130px, 1fr))`,
            }}
          >
            <div className="sticky left-0 z-10 rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
              Andar / Coluna
            </div>
            {stacks.map((stack) => (
              <div
                key={`header-${stack}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-2 text-center text-xs font-semibold text-[var(--foreground)]"
              >
                Coluna {stack}
              </div>
            ))}

            {floors.map((floor) => (
              <Fragment key={`row-${floor}`}>
                <div
                  className="sticky left-0 z-10 rounded-lg border border-[var(--border)] bg-white px-2 py-3 text-xs font-semibold text-[var(--foreground)]"
                >
                  Andar {floor}
                </div>
                {stacks.map((stack) => {
                  const unit = unitByKey.get(`${floor}:${stack}`) ?? null
                  if (!unit) {
                    return (
                      <div
                        key={`empty-${floor}-${stack}`}
                        className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/20 px-2 py-3 text-center text-xs text-[var(--muted-foreground)]"
                      >
                        -
                      </div>
                    )
                  }

                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => setSelectedUnitId(unit.id)}
                      className={`rounded-lg border px-2 py-2 text-left transition-colors hover:brightness-95 ${statusClass(unit.status)}`}
                    >
                      <p className="truncate text-xs font-bold">{unit.unitCode}</p>
                      <p className="truncate text-[11px]">{formatShortCurrency(unit.listPrice)}</p>
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <IncorporationUnitDrawerClient
        open={!!selectedUnit}
        unit={selectedUnit}
        incorporationId={incorporationId}
        canReserve={canReserve}
        leadOptions={leadOptions}
        onClose={() => setSelectedUnitId(null)}
        onReserved={(payload) => {
          setUnits((current) =>
            current.map((item) =>
              item.id === payload.unitId
                ? {
                    ...item,
                    status: 'reserved',
                    reservationExpiresAt: payload.expiresAt,
                    reservedByUserId: viewerId,
                  }
                : item
            )
          )
        }}
      />
    </div>
  )
}
