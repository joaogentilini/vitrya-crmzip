'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createLeadAction } from './actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

type PipelineRow = {
  id: string
  name: string
  created_at?: string
}

type StageRow = {
  id: string
  pipeline_id: string
  name: string
  position: number
}

type Props = {
  pipelines: PipelineRow[]
  stages: StageRow[]
}

export function CreateLeadForm({ pipelines, stages }: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const { success, error: showError } = useToast()

  const [pipelineId, setPipelineId] = useState<string>(pipelines?.[0]?.id ?? '')
  const [title, setTitle] = useState('')

  const stageOptions = useMemo(() => {
    return stages
      .filter((s) => s.pipeline_id === pipelineId)
      .sort((a, b) => a.position - b.position)
  }, [stages, pipelineId])

  const [stageId, setStageId] = useState<string>(stageOptions?.[0]?.id ?? '')

  function onChangePipeline(nextPipelineId: string) {
    setPipelineId(nextPipelineId)
    const first = stages
      .filter((s) => s.pipeline_id === nextPipelineId)
      .sort((a, b) => a.position - b.position)[0]
    setStageId(first?.id ?? '')
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!title.trim()) {
      showError('Informe um título.')
      return
    }
    if (!pipelineId) {
      showError('Selecione um pipeline.')
      return
    }
    if (!stageId) {
      showError('Selecione um estágio.')
      return
    }

    startTransition(async () => {
      try {
        await createLeadAction({ title: title.trim(), pipelineId, stageId })
        setTitle('')
        success('Lead criado com sucesso!')
        router.refresh()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Erro ao criar lead.'
        showError(message)
      }
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 p-4 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)]"
    >
      <div className="flex-1 min-w-[200px]">
        <Input
          name="title"
          label="Título do Lead"
          placeholder="Ex: Empresa XYZ - Projeto Web"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="min-w-[180px]">
        <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
          Pipeline
        </label>
        <select
          value={pipelineId}
          onChange={(e) => onChangePipeline(e.target.value)}
          disabled={isPending || pipelines.length === 0}
          className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[160px]">
        <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
          Estágio
        </label>
        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          disabled={isPending || !pipelineId || stageOptions.length === 0}
          className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" loading={isPending}>
        Criar Lead
      </Button>
    </form>
  )
}
