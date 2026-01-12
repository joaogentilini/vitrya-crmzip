'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

type LeadRow = {
  id: string
  title: string
  status: string
  pipeline_id: string | null
  stage_id: string | null
}

type PipelineRow = {
  id: string
  name: string
}

type StageRow = {
  id: string
  pipeline_id: string
  name: string
  position: number
}

interface EditLeadModalProps {
  open: boolean
  onClose: () => void
  lead: LeadRow
  pipelines: PipelineRow[]
  stages: StageRow[]
}

export function EditLeadModal({ 
  open, 
  onClose, 
  lead, 
  pipelines, 
  stages 
}: EditLeadModalProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(lead.title)
  const [pipelineId, setPipelineId] = useState(lead.pipeline_id || '')
  const [stageId, setStageId] = useState(lead.stage_id || '')
  const [titleError, setTitleError] = useState<string | undefined>()

  useEffect(() => {
    if (open) {
      setTitle(lead.title)
      setPipelineId(lead.pipeline_id || '')
      setStageId(lead.stage_id || '')
      setTitleError(undefined)
    }
  }, [open, lead])

  const stageOptions = useMemo(() => {
    if (!pipelineId) return []
    return stages
      .filter(s => s.pipeline_id === pipelineId)
      .sort((a, b) => a.position - b.position)
  }, [stages, pipelineId])

  useEffect(() => {
    if (pipelineId && stageOptions.length > 0 && !stageOptions.some(s => s.id === stageId)) {
      setStageId(stageOptions[0].id)
    } else if (pipelineId && stageOptions.length === 0) {
      setStageId('')
    }
  }, [pipelineId, stageOptions, stageId])

  const handlePipelineChange = (newPipelineId: string) => {
    setPipelineId(newPipelineId)
  }

  const validateForm = (): boolean => {
    setTitleError(undefined)

    if (!title.trim()) {
      setTitleError('O título é obrigatório')
      return false
    }
    if (title.trim().length < 3) {
      setTitleError('O título deve ter pelo menos 3 caracteres')
      return false
    }
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    startTransition(async () => {
      try {
        const { updateLeadAction } = await import('../actions')
        await updateLeadAction({
          leadId: lead.id,
          title: title.trim(),
          pipelineId: pipelineId || null,
          stageId: stageId || null,
        })
        success('Lead atualizado com sucesso!')
        router.refresh()
        onClose()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar lead.'
        showError(message)
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <>
      <div 
        className="fixed inset-0 z-50 bg-black/50 animate-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div 
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-lg animate-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-lead-title"
        onKeyDown={handleKeyDown}
      >
        <div className="p-6">
          <h2 id="edit-lead-title" className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Editar Lead
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Título *"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (titleError) setTitleError(undefined)
              }}
              error={titleError}
              disabled={isPending}
              autoFocus
            />

            <div>
              <label 
                htmlFor="edit-pipeline"
                className="block text-sm font-medium mb-1.5 text-[var(--foreground)]"
              >
                Pipeline
              </label>
              <select
                id="edit-pipeline"
                value={pipelineId}
                onChange={(e) => handlePipelineChange(e.target.value)}
                disabled={isPending}
                className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Sem pipeline</option>
                {pipelines.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label 
                htmlFor="edit-stage"
                className="block text-sm font-medium mb-1.5 text-[var(--foreground)]"
              >
                Estágio
              </label>
              <select
                id="edit-stage"
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                disabled={isPending || !pipelineId || stageOptions.length === 0}
                className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {stageOptions.length === 0 ? (
                  <option value="">
                    {pipelineId ? 'Nenhum estágio disponível' : 'Selecione um pipeline primeiro'}
                  </option>
                ) : (
                  stageOptions.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                )}
              </select>
              {pipelineId && stageOptions.length === 0 && (
                <p className="text-xs text-[var(--warning)] mt-1">
                  Este pipeline não possui estágios configurados.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={onClose}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={isPending}>
                {isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
