'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/Button'

import {
  addIncorporationMediaAssetAction,
  deleteIncorporationMediaAction,
  reorderIncorporationMediaAction,
  updateIncorporationMediaAction,
} from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

type MediaItemVm = {
  id: string
  title: string | null
  kind: string
  mediaScope: string | null
  planId: string | null
  planName: string | null
  isPublic: boolean
  isCover: boolean
  position: number
  signedUrl: string | null
}

type PlanOptionVm = {
  id: string
  name: string
}

type DragGroup = 'media' | 'document'

function isVisual(kind: string): boolean {
  return kind === 'image' || kind === 'floorplate'
}

function scopeLabel(scope: string | null): string {
  if (scope === 'project') return 'Projeto'
  if (scope === 'common_areas') return 'Areas comuns'
  if (scope === 'plan') return 'Tipologia'
  return 'Empreendimento'
}

function kindLabel(kind: string): string {
  if (kind === 'image') return 'Imagem'
  if (kind === 'floorplate') return 'Planta'
  if (kind === 'video') return 'Video'
  if (kind === 'document') return 'Documento'
  return kind
}

export default function IncorporationMediaDocumentsManagerClient({
  incorporationId,
  plans,
  items,
  canEdit,
}: {
  incorporationId: string
  plans: PlanOptionVm[]
  items: MediaItemVm[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()
  const [kindInput, setKindInput] = useState<'image' | 'floorplate' | 'video' | 'document'>('image')
  const [scopeInput, setScopeInput] = useState<'incorporation' | 'project' | 'common_areas' | 'plan'>('incorporation')
  const dragStateRef = useRef<{ id: string; group: DragGroup } | null>(null)
  const [draggingState, setDraggingState] = useState<{ id: string; group: DragGroup } | null>(null)
  const [dragOverState, setDragOverState] = useState<{ id: string; group: DragGroup } | null>(null)

  const mediaItems = useMemo(
    () =>
      items
        .filter((item) => item.kind !== 'document')
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    [items]
  )
  const documentItems = useMemo(
    () =>
      items
        .filter((item) => item.kind === 'document')
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    [items]
  )

  const [mediaOrder, setMediaOrder] = useState<string[]>(mediaItems.map((item) => item.id))
  const [documentOrder, setDocumentOrder] = useState<string[]>(documentItems.map((item) => item.id))

  useEffect(() => {
    setMediaOrder(mediaItems.map((item) => item.id))
  }, [mediaItems])

  useEffect(() => {
    setDocumentOrder(documentItems.map((item) => item.id))
  }, [documentItems])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  function saveReorder(group: DragGroup, orderedIds: string[]) {
    const formData = new FormData()
    formData.set('incorporationId', incorporationId)
    formData.set('orderedIds', JSON.stringify(orderedIds))

    startTransition(async () => {
      setFeedback(null)
      const result = await reorderIncorporationMediaAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }
      setFeedback({
        kind: 'success',
        message: group === 'media' ? 'Ordem de mídias atualizada.' : 'Ordem de documentos atualizada.',
      })
      router.refresh()
    })
  }

  function onDrop(targetId: string, group: DragGroup) {
    const drag = dragStateRef.current
    if (!drag || drag.group !== group || drag.id === targetId) {
      setDragOverState(null)
      return
    }

    const sourceOrder = group === 'media' ? [...mediaOrder] : [...documentOrder]
    const from = sourceOrder.indexOf(drag.id)
    const to = sourceOrder.indexOf(targetId)
    if (from < 0 || to < 0) return

    sourceOrder.splice(from, 1)
    sourceOrder.splice(to, 0, drag.id)

    if (group === 'media') setMediaOrder(sourceOrder)
    else setDocumentOrder(sourceOrder)

    setDragOverState(null)
    saveReorder(group, sourceOrder)
  }

  function submitUpdate(formData: FormData) {
    formData.set('incorporationId', incorporationId)
    startTransition(async () => {
      setFeedback(null)
      const result = await updateIncorporationMediaAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }
      setFeedback({ kind: 'success', message: 'Item atualizado.' })
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
      setFeedback({ kind: 'success', message: 'Item removido.' })
      router.refresh()
    })
  }

  function submitCreate(formData: FormData) {
    formData.set('incorporationId', incorporationId)
    startTransition(async () => {
      setFeedback(null)
      const result = await addIncorporationMediaAssetAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }
      const created =
        typeof result.data === 'object' &&
        result.data !== null &&
        'created' in result.data &&
        typeof (result.data as { created?: unknown }).created === 'number'
          ? (result.data as { created: number }).created
          : 1
      setFeedback({
        kind: 'success',
        message:
          created > 1
            ? `${created} arquivo(s) adicionados com sucesso.`
            : 'Arquivo adicionado com sucesso.',
      })
      router.refresh()
    })
  }

  const orderedMedia = mediaOrder.map((id) => itemById.get(id)).filter((item): item is MediaItemVm => Boolean(item))
  const orderedDocs = documentOrder.map((id) => itemById.get(id)).filter((item): item is MediaItemVm => Boolean(item))

  return (
    <div className="space-y-4">
      {canEdit ? (
        <details className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
          <summary className="cursor-pointer">
            <p className="text-sm font-semibold text-[var(--foreground)]">Adicionar mídia ou documento</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Secao colapsavel. Expanda quando precisar subir novos arquivos.
            </p>
          </summary>
          <form
            className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3"
            onSubmit={(event) => {
              event.preventDefault()
              const fileInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="mediaFiles"]')
              const selectedFiles = fileInput?.files ? Array.from(fileInput.files) : []
              const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0)
              const totalLimitBytes = 35 * 1024 * 1024

              if (selectedFiles.length > 20) {
                setFeedback({ kind: 'error', message: 'Envie no máximo 20 arquivos por lote.' })
                return
              }

              if (totalBytes > totalLimitBytes) {
                setFeedback({
                  kind: 'error',
                  message: 'Lote muito grande. Envie até ~35MB por envio para evitar falha no upload.',
                })
                return
              }

              submitCreate(new FormData(event.currentTarget))
            }}
          >

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              name="title"
              placeholder="Título"
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
            />

            <select
              name="kind"
              value={kindInput}
              onChange={(event) => setKindInput(event.target.value as 'image' | 'floorplate' | 'video' | 'document')}
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
            >
              <option value="image">Imagem</option>
              <option value="floorplate">Planta</option>
              <option value="video">Video</option>
              <option value="document">Documento</option>
            </select>

            <select
              name="mediaScope"
              value={scopeInput}
              onChange={(event) => setScopeInput(event.target.value as 'incorporation' | 'project' | 'common_areas' | 'plan')}
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm"
            >
              <option value="incorporation">Empreendimento</option>
              <option value="project">Projeto</option>
              <option value="common_areas">Areas comuns</option>
              <option value="plan">Tipologia</option>
            </select>

            <select
              name="planId"
              disabled={scopeInput !== 'plan'}
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm disabled:bg-[var(--muted)]/40"
              defaultValue=""
            >
              <option value="">Tipologia (opcional)</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          <input
            type="file"
            name="mediaFiles"
            required
            multiple={kindInput === 'image' || kindInput === 'floorplate'}
            accept={
              kindInput === 'image' || kindInput === 'floorplate'
                ? 'image/png,image/jpeg,image/webp,image/avif'
                : kindInput === 'video'
                  ? 'video/*'
                  : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,image/*'
            }
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-[var(--muted)] file:px-2 file:py-1"
          />

          <p className="text-[11px] text-[var(--muted-foreground)]">
            {kindInput === 'image' || kindInput === 'floorplate'
              ? 'Você pode selecionar várias imagens de uma vez (até 20 por lote).'
              : 'Para video e documento, envie um arquivo por vez para melhor controle.'}
          </p>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
              <input type="checkbox" name="isPublic" defaultChecked className="h-4 w-4 rounded border-[var(--border)]" />
              <span>Exibir no público</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
              <input
                type="checkbox"
                name="isCover"
                disabled={kindInput === 'document'}
                className="h-4 w-4 rounded border-[var(--border)] disabled:opacity-50"
              />
              <span>Definir como capa</span>
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Adicionar arquivo'}
            </Button>
          </div>
          </form>
        </details>
      ) : null}

      <div className="space-y-4">
        <details
          open={!canEdit}
          className={`space-y-3 rounded-[var(--radius-lg)] border bg-white p-3 transition ${
            draggingState?.group === 'media'
              ? 'border-[var(--primary)]/45 ring-2 ring-[var(--primary)]/10'
              : 'border-[var(--border)]'
          }`}
        >
          <summary className="list-none cursor-pointer">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Mídias</h3>
              <span className="text-xs text-[var(--muted-foreground)]">Arraste e solte para ordenar</span>
            </div>
          </summary>
          <div className="border-t border-[var(--border)] pt-3">

          {orderedMedia.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma mídia cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {orderedMedia.map((item) => (
                <article
                  key={item.id}
                  draggable={canEdit}
                  onDragStart={() => {
                    dragStateRef.current = { id: item.id, group: 'media' }
                    setDraggingState({ id: item.id, group: 'media' })
                  }}
                  onDragEnd={() => {
                    dragStateRef.current = null
                    setDraggingState(null)
                    setDragOverState(null)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (dragStateRef.current?.group === 'media') {
                      setDragOverState({ id: item.id, group: 'media' })
                    }
                  }}
                  onDrop={() => onDrop(item.id, 'media')}
                  className={`rounded-[var(--radius)] border bg-[var(--muted)]/15 p-2 transition ${
                    dragOverState?.group === 'media' && dragOverState.id === item.id
                      ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/25'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex gap-2">
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]/30">
                      {item.signedUrl && isVisual(item.kind) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.signedUrl} alt={item.title || 'Mídia'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-[11px] text-[var(--muted-foreground)]">
                          {kindLabel(item.kind)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">{kindLabel(item.kind)}</span>
                        <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">{scopeLabel(item.mediaScope)}</span>
                        {item.planName ? <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">{item.planName}</span> : null}
                        {item.isCover ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-700">Capa</span> : null}
                      </div>

                      {canEdit ? (
                        <form
                          className="grid gap-2 sm:grid-cols-2"
                          onSubmit={(event) => {
                            event.preventDefault()
                            submitUpdate(new FormData(event.currentTarget))
                          }}
                        >
                          <input type="hidden" name="mediaId" value={item.id} />
                          <input
                            name="title"
                            defaultValue={item.title || ''}
                            placeholder="Título"
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
                            <option value="keep">Manter capa</option>
                            {isVisual(item.kind) ? <option value="set">Definir capa</option> : null}
                            <option value="unset">Remover capa</option>
                          </select>
                          <div className="flex gap-2">
                            <Button type="submit" disabled={isPending} className="h-8 px-2 text-xs">
                              Salvar
                            </Button>
                            <Button
                              type="button"
                              disabled={isPending}
                              className="h-8 px-2 text-xs bg-rose-600 hover:bg-rose-700"
                              onClick={() => submitDelete(item.id)}
                            >
                              Excluir
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {item.title || 'Sem título'} {item.isPublic ? '(Pública)' : '(Interna)'}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          </div>
        </details>

        <details
          open={!canEdit}
          className={`space-y-3 rounded-[var(--radius-lg)] border bg-white p-3 transition ${
            draggingState?.group === 'document'
              ? 'border-[var(--primary)]/45 ring-2 ring-[var(--primary)]/10'
              : 'border-[var(--border)]'
          }`}
        >
          <summary className="list-none cursor-pointer">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Documentos</h3>
              <span className="text-xs text-[var(--muted-foreground)]">Arraste e solte para ordenar</span>
            </div>
          </summary>
          <div className="border-t border-[var(--border)] pt-3">

          {orderedDocs.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhum documento cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {orderedDocs.map((item) => (
                <article
                  key={item.id}
                  draggable={canEdit}
                  onDragStart={() => {
                    dragStateRef.current = { id: item.id, group: 'document' }
                    setDraggingState({ id: item.id, group: 'document' })
                  }}
                  onDragEnd={() => {
                    dragStateRef.current = null
                    setDraggingState(null)
                    setDragOverState(null)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (dragStateRef.current?.group === 'document') {
                      setDragOverState({ id: item.id, group: 'document' })
                    }
                  }}
                  onDrop={() => onDrop(item.id, 'document')}
                  className={`rounded-[var(--radius)] border bg-[var(--muted)]/15 p-2 transition ${
                    dragOverState?.group === 'document' && dragOverState.id === item.id
                      ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/25'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">Documento</span>
                      <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">{scopeLabel(item.mediaScope)}</span>
                      {item.planName ? <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">{item.planName}</span> : null}
                    </div>

                    {canEdit ? (
                      <form
                        className="grid gap-2 sm:grid-cols-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          submitUpdate(new FormData(event.currentTarget))
                        }}
                      >
                        <input type="hidden" name="mediaId" value={item.id} />
                        <input
                          name="title"
                          defaultValue={item.title || ''}
                          placeholder="Título do documento"
                          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                        />
                        <select
                          name="visibility"
                          defaultValue={item.isPublic ? 'public' : 'internal'}
                          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                        >
                          <option value="public">Público</option>
                          <option value="internal">Somente usuários</option>
                        </select>
                        <input type="hidden" name="coverMode" value="unset" />
                        <div className="flex gap-2">
                          <Button type="submit" disabled={isPending} className="h-8 px-2 text-xs">
                            Salvar
                          </Button>
                          <Button
                            type="button"
                            disabled={isPending}
                            className="h-8 px-2 text-xs bg-rose-600 hover:bg-rose-700"
                            onClick={() => submitDelete(item.id)}
                          >
                            Excluir
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {item.title || 'Documento'} {item.isPublic ? '(Público)' : '(Interno)'}
                      </div>
                    )}

                    {item.signedUrl ? (
                      <a
                        href={item.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-xs font-medium text-[var(--primary)] hover:underline"
                      >
                        Abrir documento
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
          </div>
        </details>
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
