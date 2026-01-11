'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { moveLeadToStageAction } from './actions'

import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type PipelineRow = { id: string; name: string }
type StageRow = { id: string; pipeline_id: string; name: string; position: number }
type LeadRow = {
  id: string
  title: string
  status: 'open' | 'won' | 'lost'
  pipeline_id: string
  stage_id: string
  created_at: string | null
}

type Props = {
  pipelines: PipelineRow[]
  stages: StageRow[]
  leads: LeadRow[]
  defaultPipelineId: string | null
}

function DraggableCard({
  id,
  disabled,
  children,
}: {
  id: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !!disabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(!disabled ? attributes : {})}
      {...(!disabled ? listeners : {})}
    >
      {children}
    </div>
  )
}

function DroppableColumn({
  id,
  title,
  count,
  children,
}: {
  id: string
  title: string
  count: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 280,
        border: '1px solid #e5e5e5',
        borderRadius: 10,
        padding: 12,
        background: isOver ? '#f7f7f7' : '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <strong>{title}</strong>
        <span style={{ opacity: 0.7 }}>{count}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

export function KanbanBoard({ pipelines, stages, leads, defaultPipelineId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [pipelineId, setPipelineId] = useState<string>(
    defaultPipelineId ?? pipelines?.[0]?.id ?? ''
  )

  const columns = useMemo(() => {
    return stages
      .filter((s) => s.pipeline_id === pipelineId)
      .sort((a, b) => a.position - b.position)
  }, [stages, pipelineId])

  // 6.4: Filtrar por pipeline + status=open (não poluir o kanban)
  const pipelineLeads = useMemo(() => {
    return leads.filter((l) => l.pipeline_id === pipelineId && l.status === 'open')
  }, [leads, pipelineId])

  const leadsByStage = useMemo(() => {
    const map = new Map<string, LeadRow[]>()
    for (const l of pipelineLeads) {
      const arr = map.get(l.stage_id) ?? []
      arr.push(l)
      map.set(l.stage_id, arr)
    }
    return map
  }, [pipelineLeads])

  function formatDate(value: string | null) {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString()
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const leadId = String(active.id)
    const toStageId = String(over.id)

    const lead = pipelineLeads.find((l) => l.id === leadId)
    if (!lead) return
    if (lead.status !== 'open') return
    if (lead.stage_id === toStageId) return
    if (!columns.some((c) => c.id === toStageId)) return

    startTransition(async () => {
      try {
        await moveLeadToStageAction({ leadId, pipelineId, toStageId })
        router.refresh()
      } catch (err: any) {
        console.error('[onDragEnd] error:', err)
        alert(err?.message ?? 'Erro ao mover lead. Veja o console/terminal.')
      }
    })
  }

  function onFinalizeLead(leadId: string, status: 'won' | 'lost') {
    startTransition(async () => {
      try {
        const msg = status === 'won' ? 'Marcar lead como GANHO?' : 'Marcar lead como PERDIDO?'
        if (!confirm(msg)) return

        const resp = await fetch('/api/leads/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId, status }),
        })

        const json = await resp.json()
        if (!resp.ok) throw new Error(json?.error ?? 'Erro ao finalizar lead')

        router.refresh()
      } catch (err: any) {
        console.error('[onFinalizeLead] error:', err)
        alert(err?.message ?? 'Erro ao finalizar lead. Veja o console/terminal.')
      }
    })
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>Pipeline:</div>
        <select
          value={pipelineId}
          onChange={(e) => setPipelineId(e.target.value)}
          disabled={isPending || pipelines.length === 0}
          style={{ padding: 8, minWidth: 260 }}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {isPending && <span style={{ fontSize: 12, opacity: 0.7 }}>Atualizando...</span>}
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 16,
            overflowX: 'auto',
            paddingBottom: 8,
          }}
        >
          {columns.map((col) => {
            const items = (leadsByStage.get(col.id) ?? []).sort((a, b) =>
              (b.created_at ?? '').localeCompare(a.created_at ?? '')
            )

            return (
              <DroppableColumn key={col.id} id={col.id} title={col.name} count={items.length}>
                {items.map((l) => (
                  <DraggableCard key={l.id} id={l.id} disabled={isPending || l.status !== 'open'}>
                    <div
                      style={{
                        border: '1px solid #eee',
                        borderRadius: 10,
                        padding: 10,
                        background: '#fff',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{l.title}</div>

                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        {formatDate(l.created_at)}
                      </div>

                      {l.status === 'open' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <button
                            type="button"
                            disabled={isPending}
                            style={{
                              flex: 1,
                              background: '#16a34a',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              padding: '6px 8px',
                              cursor: isPending ? 'not-allowed' : 'pointer',
                              fontSize: 12,
                              opacity: isPending ? 0.8 : 1,
                            }}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              onFinalizeLead(l.id, 'won')
                            }}
                          >
                            Ganhar
                          </button>

                          <button
                            type="button"
                            disabled={isPending}
                            style={{
                              flex: 1,
                              background: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              padding: '6px 8px',
                              cursor: isPending ? 'not-allowed' : 'pointer',
                              fontSize: 12,
                              opacity: isPending ? 0.8 : 1,
                            }}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              onFinalizeLead(l.id, 'lost')
                            }}
                          >
                            Perder
                          </button>
                        </div>
                      )}
                    </div>
                  </DraggableCard>
                ))}

                {!items.length && <div style={{ fontSize: 12, opacity: 0.6 }}>Sem leads</div>}
              </DroppableColumn>
            )
          })}
        </div>
      </DndContext>
    </div>
  )
}
