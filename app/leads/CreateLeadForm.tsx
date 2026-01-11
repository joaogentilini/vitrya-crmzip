'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createLeadAction } from './actions'

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
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // pipeline selecionado (default: primeiro)
  const [pipelineId, setPipelineId] = useState<string>(pipelines?.[0]?.id ?? '')

  // options de stages filtrados pelo pipeline
  const stageOptions = useMemo(() => {
    return stages
      .filter((s) => s.pipeline_id === pipelineId)
      .sort((a, b) => a.position - b.position)
  }, [stages, pipelineId])

  // stage selecionado (default: primeiro do pipeline)
  const [stageId, setStageId] = useState<string>(stageOptions?.[0]?.id ?? '')

  function onChangePipeline(nextPipelineId: string) {
    setPipelineId(nextPipelineId)

    // ao trocar pipeline, define o primeiro stage daquele pipeline
    const first = stages
      .filter((s) => s.pipeline_id === nextPipelineId)
      .sort((a, b) => a.position - b.position)[0]

    setStageId(first?.id ?? '')
  }

  function onSubmit(formData: FormData) {
    setMsg(null)

    const title = String(formData.get('title') || '').trim()
    if (!title) {
      setMsg({ type: 'err', text: 'Informe um título.' })
      return
    }
    if (!pipelineId) {
      setMsg({ type: 'err', text: 'Selecione um pipeline.' })
      return
    }
    if (!stageId) {
      setMsg({ type: 'err', text: 'Selecione um stage.' })
      return
    }

    startTransition(async () => {
      try {
        await createLeadAction({ title, pipelineId, stageId })

        formRef.current?.reset()
        setMsg({ type: 'ok', text: 'Lead criado com sucesso.' })
        router.refresh()
      } catch (e: any) {
        setMsg({ type: 'err', text: e?.message || 'Erro ao criar lead.' })
      }
    })
  }

  return (
    <div style={{ marginTop: 12 }}>
      <form
        ref={formRef}
        action={onSubmit}
        style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <input
          name="title"
          placeholder="Título do lead"
          style={{ padding: 8, width: 320 }}
          disabled={isPending}
        />

        <select
          value={pipelineId}
          onChange={(e) => onChangePipeline(e.target.value)}
          disabled={isPending || pipelines.length === 0}
          style={{ padding: 8, minWidth: 240 }}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          disabled={isPending || !pipelineId || stageOptions.length === 0}
          style={{ padding: 8, minWidth: 200 }}
        >
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button type="submit" style={{ padding: '8px 12px' }} disabled={isPending}>
          {isPending ? 'Salvando...' : 'Criar Lead'}
        </button>
      </form>

      {msg && (
        <p style={{ marginTop: 8, color: msg.type === 'err' ? 'crimson' : 'green' }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
