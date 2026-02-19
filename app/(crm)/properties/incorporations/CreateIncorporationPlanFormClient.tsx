'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import { createIncorporationPlanAction } from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

export default function CreateIncorporationPlanFormClient({
  incorporationId,
}: {
  incorporationId: string
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formElement = event.currentTarget
        const formData = new FormData(formElement)
        formData.set('incorporationId', incorporationId)

        startTransition(async () => {
          setFeedback(null)
          const result = await createIncorporationPlanAction(formData)
          if (!result.success) {
            setFeedback({ kind: 'error', message: result.error })
            return
          }

          const generated = result.data.generatedUnits
          setFeedback({
            kind: 'success',
            message:
              generated > 0
                ? `Tipologia criada com sucesso e ${generated} unidade(s) geradas.`
                : 'Tipologia criada com sucesso.',
          })
          formElement.reset()
          router.refresh()
        })
      }}
    >
      <input type="hidden" name="incorporationId" value={incorporationId} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
          <span>Nome da tipologia *</span>
          <input
            name="name"
            required
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="Ex: Tipo 2Q Premium"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Preço inicial</span>
          <input
            name="priceFrom"
            type="number"
            min="0"
            step="0.01"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="Ex: 450000"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Area (m2)</span>
          <input
            name="areaM2"
            type="number"
            min="0"
            step="0.01"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="Ex: 78"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Quartos</span>
          <input
            name="bedrooms"
            type="number"
            min="0"
            step="1"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Comodos</span>
          <input
            name="roomsCount"
            type="number"
            min="0"
            step="1"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Suites</span>
          <input
            name="suites"
            type="number"
            min="0"
            step="1"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Banheiros</span>
          <input
            name="bathrooms"
            type="number"
            min="0"
            step="1"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Vagas</span>
          <input
            name="parking"
            type="number"
            min="0"
            step="1"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/30 p-3">
        <p className="text-xs font-semibold text-[var(--foreground)]">
          Geracao automatica de unidades
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Defina blocos, andares e apartamentos por andar para gerar o espelho inicial desta tipologia.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
            <span>Blocos *</span>
            <input
              name="blocksCount"
              type="number"
              min="1"
              max="50"
              step="1"
              defaultValue={1}
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            />
          </label>

          <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
            <span>Andares por bloco *</span>
            <input
              name="floorsPerBlock"
              type="number"
              min="1"
              max="300"
              step="1"
              defaultValue={1}
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            />
          </label>

          <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
            <span>Apt por andar *</span>
            <input
              name="unitsPerFloor"
              type="number"
              min="1"
              max="50"
              step="1"
              defaultValue={1}
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            />
          </label>

          <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
            <span>Prefixo bloco (opcional)</span>
            <input
              name="blockPrefix"
              maxLength={8}
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm uppercase text-[var(--foreground)]"
              placeholder="Ex: TORRE"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
            <input type="checkbox" name="generateUnitsNow" defaultChecked className="h-4 w-4 rounded border-[var(--border)]" />
            <span>Gerar unidades automaticamente agora</span>
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
            <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-[var(--border)]" />
            <span>Tipologia ativa no público</span>
          </label>
        </div>
      </div>

      <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
        <span>Descrição da tipologia</span>
        <textarea
          name="description"
          rows={2}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
          placeholder="Diferenciais desta tipologia"
        />
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
          {isPending ? 'Salvando tipologia...' : 'Criar tipologia'}
        </Button>
      </div>
    </form>
  )
}
