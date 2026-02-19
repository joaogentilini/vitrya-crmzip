'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import { updateIncorporationPlanAction } from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

type EditablePlanVm = {
  id: string
  name: string
  roomsCount: number | null
  bedrooms: number | null
  suites: number | null
  bathrooms: number | null
  parking: number | null
  areaM2: number | null
  description: string | null
  priceFrom: number | null
  isActive: boolean
  blocksCount: number
  floorsPerBlock: number
  unitsPerFloor: number
  blockPrefix: string | null
  virtualTourUrl: string | null
}

export default function EditIncorporationPlanFormClient({
  incorporationId,
  plan,
}: {
  incorporationId: string
  plan: EditablePlanVm
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        formData.set('incorporationId', incorporationId)
        formData.set('planId', plan.id)

        startTransition(async () => {
          setFeedback(null)
          const result = await updateIncorporationPlanAction(formData)
          if (!result.success) {
            setFeedback({ kind: 'error', message: result.error })
            return
          }
          setFeedback({ kind: 'success', message: 'Tipologia atualizada com sucesso.' })
          router.refresh()
        })
      }}
    >
      <input type="hidden" name="incorporationId" value={incorporationId} />
      <input type="hidden" name="planId" value={plan.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
          <span>Nome da tipologia *</span>
          <input
            name="name"
            required
            defaultValue={plan.name}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Preço inicial</span>
          <input
            name="priceFrom"
            type="number"
            min="0"
            step="0.01"
            defaultValue={typeof plan.priceFrom === 'number' ? plan.priceFrom : ''}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Area (m2)</span>
          <input
            name="areaM2"
            type="number"
            min="0"
            step="0.01"
            defaultValue={typeof plan.areaM2 === 'number' ? plan.areaM2 : ''}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Quartos</span>
          <input
            name="bedrooms"
            type="number"
            min="0"
            step="1"
            defaultValue={typeof plan.bedrooms === 'number' ? plan.bedrooms : ''}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Comodos</span>
          <input
            name="roomsCount"
            type="number"
            min="0"
            step="1"
            defaultValue={typeof plan.roomsCount === 'number' ? plan.roomsCount : ''}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Suites</span>
          <input
            name="suites"
            type="number"
            min="0"
            step="1"
            defaultValue={typeof plan.suites === 'number' ? plan.suites : ''}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Banheiros</span>
          <input
            name="bathrooms"
            type="number"
            min="0"
            step="1"
            defaultValue={typeof plan.bathrooms === 'number' ? plan.bathrooms : ''}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Vagas</span>
          <input
            name="parking"
            type="number"
            min="0"
            step="1"
            defaultValue={typeof plan.parking === 'number' ? plan.parking : ''}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/25 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Blocos</span>
          <input
            name="blocksCount"
            type="number"
            min="1"
            max="50"
            step="1"
            defaultValue={plan.blocksCount}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Andares por bloco</span>
          <input
            name="floorsPerBlock"
            type="number"
            min="1"
            max="300"
            step="1"
            defaultValue={plan.floorsPerBlock}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Apt por andar</span>
          <input
            name="unitsPerFloor"
            type="number"
            min="1"
            max="50"
            step="1"
            defaultValue={plan.unitsPerFloor}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Prefixo bloco</span>
          <input
            name="blockPrefix"
            maxLength={8}
            defaultValue={plan.blockPrefix || ''}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm uppercase"
            placeholder="Ex: TORRE"
          />
        </label>
      </div>

      <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
        <span>Tour virtual da tipologia (RV)</span>
        <input
          name="virtualTourUrl"
          type="url"
          defaultValue={plan.virtualTourUrl || ''}
          placeholder="https://..."
          className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
        />
      </label>

      <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
        <span>Descrição</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={plan.description || ''}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm"
          placeholder="Diferenciais da planta"
        />
      </label>

      <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
        <input type="checkbox" name="isActive" defaultChecked={plan.isActive} className="h-4 w-4 rounded border-[var(--border)]" />
        <span>Tipologia ativa no público</span>
      </label>

      {feedback ? (
        <p
          className={`rounded-[var(--radius)] border px-3 py-2 text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar tipologia'}
        </Button>
      </div>
    </form>
  )
}
