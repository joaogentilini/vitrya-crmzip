'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import {
  updateIncorporationPlanVirtualTourAction,
  updateIncorporationVirtualTourAction,
} from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

type VirtualTourPlanVm = {
  id: string
  name: string
  isActive: boolean
  virtualTourUrl: string | null
}

export default function VirtualTourManagerClient({
  incorporationId,
  incorporationTourUrl,
  plans,
  canEdit,
}: {
  incorporationId: string
  incorporationTourUrl: string | null
  plans: VirtualTourPlanVm[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()

  function saveIncorporationTour(formData: FormData) {
    formData.set('incorporationId', incorporationId)
    startTransition(async () => {
      setFeedback(null)
      const result = await updateIncorporationVirtualTourAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }
      setFeedback({ kind: 'success', message: 'Tour virtual do empreendimento atualizado.' })
      router.refresh()
    })
  }

  function savePlanTour(formData: FormData) {
    formData.set('incorporationId', incorporationId)
    startTransition(async () => {
      setFeedback(null)
      const result = await updateIncorporationPlanVirtualTourAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }
      setFeedback({ kind: 'success', message: 'Tour virtual da tipologia atualizado.' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4">
        <p className="text-sm font-semibold text-[var(--foreground)]">Tour virtual do empreendimento</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Link unico para apresentar o empreendimento completo (Matterport, Kuula, YouTube 360, etc).
        </p>

        {canEdit ? (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              saveIncorporationTour(new FormData(event.currentTarget))
            }}
          >
            <input type="hidden" name="incorporationId" value={incorporationId} />
            <input
              name="virtualTourUrl"
              type="url"
              defaultValue={incorporationTourUrl || ''}
              placeholder="https://..."
              className="h-9 flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
            />
            <Button type="submit" disabled={isPending} className="h-9 px-3 text-sm">
              {isPending ? 'Salvando...' : 'Salvar URL'}
            </Button>
          </form>
        ) : null}

        {incorporationTourUrl ? (
          <a
            href={incorporationTourUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex text-sm font-medium text-[var(--primary)] hover:underline"
          >
            Abrir tour do empreendimento
          </a>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">Nenhum tour configurado.</p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">{plan.name}</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  plan.isActive
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                {plan.isActive ? 'Ativa' : 'Inativa'}
              </span>
            </div>

            {canEdit ? (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  savePlanTour(new FormData(event.currentTarget))
                }}
              >
                <input type="hidden" name="incorporationId" value={incorporationId} />
                <input type="hidden" name="planId" value={plan.id} />
                <input
                  name="virtualTourUrl"
                  type="url"
                  defaultValue={plan.virtualTourUrl || ''}
                  placeholder="https://..."
                  className="h-8 flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                />
                <Button type="submit" disabled={isPending} className="h-8 px-2 text-xs">
                  Salvar
                </Button>
              </form>
            ) : null}

            {plan.virtualTourUrl ? (
              <a
                href={plan.virtualTourUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-medium text-[var(--primary)] hover:underline"
              >
                Abrir tour da tipologia
              </a>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">Sem tour configurado.</p>
            )}
          </div>
        ))}
      </div>

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
    </div>
  )
}
