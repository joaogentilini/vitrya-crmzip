'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import { addIncorporationPlanMediaAction } from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

export default function PlanMediaUploaderClient({
  incorporationId,
  planId,
}: {
  incorporationId: string
  planId: string
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/20 p-2"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        formData.set('incorporationId', incorporationId)
        formData.set('planId', planId)
        formData.set('mediaScope', 'plan')

        startTransition(async () => {
          setFeedback(null)
          const result = await addIncorporationPlanMediaAction(formData)
          if (!result.success) {
            setFeedback({ kind: 'error', message: result.error })
            return
          }

          setFeedback({ kind: 'success', message: 'Imagem da planta enviada com sucesso.' })
          event.currentTarget.reset()
          router.refresh()
        })
      }}
    >
      <p className="text-xs font-semibold text-[var(--foreground)]">Adicionar imagem da planta</p>
      <input type="hidden" name="incorporationId" value={incorporationId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="mediaScope" value="plan" />

      <input
        name="title"
        placeholder="Título da imagem (opcional)"
        className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
      />
      <input
        type="file"
        name="mediaFile"
        accept="image/png,image/jpeg,image/webp,image/avif"
        required
        className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)] file:mr-2 file:rounded file:border-0 file:bg-[var(--muted)] file:px-2 file:py-1"
      />
      <label className="inline-flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <input type="checkbox" name="isCover" className="h-3.5 w-3.5 rounded border-[var(--border)]" />
        <span>Definir como capa da tipologia</span>
      </label>
      <label className="inline-flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <input type="checkbox" name="isPublic" defaultChecked className="h-3.5 w-3.5 rounded border-[var(--border)]" />
        <span>Exibir no público</span>
      </label>

      {feedback ? (
        <p
          className={`rounded-[var(--radius)] border px-2 py-1 text-xs ${
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="h-8 px-2 text-xs">
        {isPending ? 'Enviando...' : 'Enviar imagem'}
      </Button>
    </form>
  )
}
