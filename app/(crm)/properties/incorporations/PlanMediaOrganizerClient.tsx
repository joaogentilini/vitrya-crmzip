'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import {
  deleteIncorporationMediaAction,
  updateIncorporationMediaAction,
} from './actions'
import PlanMediaUploaderClient from './PlanMediaUploaderClient'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

type PlanMediaItemVm = {
  id: string
  title: string | null
  position: number
  isPublic: boolean
  isCover: boolean
  signedUrl: string | null
}

type InheritedMediaItemVm = {
  id: string
  title: string | null
  mediaScope: string | null
  signedUrl: string | null
}

function scopeLabel(scope: string | null): string {
  if (scope === 'project') return 'Projeto'
  if (scope === 'common_areas') return 'Areas comuns'
  return 'Empreendimento'
}

export default function PlanMediaOrganizerClient({
  incorporationId,
  planId,
  ownMedia,
  inheritedMedia,
}: {
  incorporationId: string
  planId: string
  ownMedia: PlanMediaItemVm[]
  inheritedMedia: InheritedMediaItemVm[]
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()

  function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set('incorporationId', incorporationId)

    startTransition(async () => {
      setFeedback(null)
      const result = await updateIncorporationMediaAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }
      setFeedback({ kind: 'success', message: 'Mídia atualizada com sucesso.' })
      router.refresh()
    })
  }

  function submitDelete(mediaId: string) {
    const formData = new FormData()
    formData.set('incorporationId', incorporationId)
    formData.set('mediaId', mediaId)

    startTransition(async () => {
      setFeedback(null)
      const result = await deleteIncorporationMediaAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }
      setFeedback({ kind: 'success', message: 'Mídia removida com sucesso.' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <PlanMediaUploaderClient incorporationId={incorporationId} planId={planId} />

      {ownMedia.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Esta tipologia ainda não possui mídias proprias.
        </p>
      ) : (
        <div className="space-y-2">
          {ownMedia.map((item) => (
            <form
              key={item.id}
              className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-white/70 p-2"
              onSubmit={submitUpdate}
            >
              <input type="hidden" name="mediaId" value={item.id} />
              <div className="flex gap-2">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]/20">
                  {item.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.signedUrl} alt={item.title || 'Mídia'} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <input
                    name="title"
                    defaultValue={item.title || ''}
                    placeholder="Título da mídia"
                    className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                  />
                  <input
                    name="position"
                    type="number"
                    min="0"
                    defaultValue={item.position}
                    className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                  />
                  <select
                    name="visibility"
                    defaultValue={item.isPublic ? 'public' : 'internal'}
                    className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                  >
                    <option value="public">Pública</option>
                    <option value="internal">Interna</option>
                  </select>
                  <select
                    name="coverMode"
                    defaultValue="keep"
                    className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                  >
                    <option value="keep">Manter capa atual</option>
                    <option value="set">{item.isCover ? 'Permanecer capa' : 'Definir como capa'}</option>
                    <option value="unset">Remover capa</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isPending} className="h-8 px-2 text-xs">
                  {isPending ? 'Salvando...' : 'Salvar mídia'}
                </Button>
                <Button
                  type="button"
                  disabled={isPending}
                  className="h-8 px-2 text-xs bg-rose-600 hover:bg-rose-700"
                  onClick={() => submitDelete(item.id)}
                >
                  Remover
                </Button>
                {item.isCover ? (
                  <span className="inline-flex h-8 items-center rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-2 text-xs font-medium text-amber-700">
                    Capa da tipologia
                  </span>
                ) : null}
              </div>
            </form>
          ))}
        </div>
      )}

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/20 p-2">
        <p className="text-xs font-semibold text-[var(--foreground)]">Mídias herdadas</p>
        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          Estas mídias vem do empreendimento (projeto/areas comuns) e aparecem junto desta planta.
        </p>
        {inheritedMedia.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Sem mídias herdadas.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
            {inheritedMedia.slice(0, 9).map((item) => (
              <div key={item.id} className="overflow-hidden rounded border border-[var(--border)] bg-white/70">
                <div className="h-16 bg-[var(--muted)]/20">
                  {item.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.signedUrl} alt={item.title || 'Mídia herdada'} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="space-y-1 p-2">
                  <p className="line-clamp-1 text-[11px] font-medium text-[var(--foreground)]">{item.title || 'Mídia'}</p>
                  <p className="text-[10px] text-[var(--muted-foreground)]">{scopeLabel(item.mediaScope)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
