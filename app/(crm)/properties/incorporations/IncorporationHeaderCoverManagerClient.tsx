'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import { setIncorporationHeaderCoverAction } from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

export default function IncorporationHeaderCoverManagerClient({
  incorporationId,
  hasDeveloperCover,
  hasDeveloperLogo,
}: {
  incorporationId: string
  hasDeveloperCover: boolean
  hasDeveloperLogo: boolean
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData) {
    formData.set('incorporationId', incorporationId)

    startTransition(async () => {
      setFeedback(null)
      const result = await setIncorporationHeaderCoverAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }
      setFeedback({ kind: 'success', message: 'Fundo do cabeçalho atualizado.' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
      <p className="text-xs font-semibold text-[var(--foreground)]">Fundo do cabeçalho</p>
      <p className="text-[11px] text-[var(--muted-foreground)]">
        Escolha a origem da imagem de capa: construtora ou upload do empreendimento.
      </p>

      <div className="flex flex-wrap gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const formData = new FormData(event.currentTarget)
            formData.set('source', 'developer_cover')
            submit(formData)
          }}
        >
          <input type="hidden" name="incorporationId" value={incorporationId} />
          <Button type="submit" disabled={isPending || !hasDeveloperCover} className="h-8 px-2 text-xs">
            Usar capa da construtora
          </Button>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            const formData = new FormData(event.currentTarget)
            formData.set('source', 'developer_logo')
            submit(formData)
          }}
        >
          <input type="hidden" name="incorporationId" value={incorporationId} />
          <Button type="submit" disabled={isPending || !hasDeveloperLogo} className="h-8 px-2 text-xs">
            Usar logo da construtora
          </Button>
        </form>
      </div>

      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
          formData.set('source', 'upload')
          submit(formData)
        }}
      >
        <input type="hidden" name="incorporationId" value={incorporationId} />
        <input
          type="file"
          name="coverFile"
          accept="image/png,image/jpeg,image/webp,image/avif"
          required
          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-[var(--muted)] file:px-2 file:py-1"
        />
        <Button type="submit" disabled={isPending} className="h-8 px-2 text-xs">
          {isPending ? 'Aplicando...' : 'Enviar fundo'}
        </Button>
      </form>

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
    </div>
  )
}
