'use client'

import React, { useMemo, useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { moveLeadToStageAction } from './actions'

import { DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent, defaultDropAnimationSideEffects } from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
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

function LeadCard({ 
  lead, 
  isDragging, 
  disabled, 
  isOptimistic,
  onFinalize 
}: { 
  lead: LeadRow; 
  isDragging?: boolean; 
  disabled?: boolean;
  isOptimistic?: boolean;
  onFinalize?: (leadId: string, status: 'won' | 'lost') => void;
}) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  function formatDate(value: string | null) {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    
    // Fix hydration mismatch: render deterministic output on server
    // and locale string only on client
    if (!mounted) {
      return d.toISOString().split('T')[0] // or simply '...'
    }
    
    return d.toLocaleString()
  }

  return (
    <div
      style={{
        border: isOptimistic ? '1px dashed #3b82f6' : '1px solid #eee',
        borderRadius: 10,
        padding: 10,
        background: '#fff',
        boxShadow: isDragging ? '0 5px 15px rgba(0,0,0,0.1)' : 'none',
        opacity: disabled || isOptimistic ? 0.6 : 1,
        position: 'relative',
        transition: 'all 0.2s ease',
      }}
    >
      {isOptimistic && (
        <div style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#3b82f6',
          animation: 'pulse 1.5s infinite'
        }} />
      )}
      <div style={{ fontWeight: 600 }}>{lead.title}</div>

      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
        {formatDate(lead.created_at)}
      </div>

      {lead.status === 'open' && onFinalize && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button
            type="button"
            disabled={disabled || isOptimistic}
            style={{
              flex: 1,
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 8px',
              cursor: (disabled || isOptimistic) ? 'not-allowed' : 'pointer',
              fontSize: 12,
              opacity: (disabled || isOptimistic) ? 0.8 : 1,
            }}
            onClick={(e) => {
              console.log('Ganhar clicked for lead:', lead.id)
              e.preventDefault()
              e.stopPropagation()
              if (onFinalize) onFinalize(lead.id, 'won')
            }}
          >
            Ganhar
          </button>

          <button
            type="button"
            disabled={disabled || isOptimistic}
            style={{
              flex: 1,
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 8px',
              cursor: (disabled || isOptimistic) ? 'not-allowed' : 'pointer',
              fontSize: 12,
              opacity: (disabled || isOptimistic) ? 0.8 : 1,
            }}
            onClick={(e) => {
              console.log('Perder clicked for lead:', lead.id)
              e.preventDefault()
              e.stopPropagation()
              if (onFinalize) onFinalize(lead.id, 'lost')
            }}
          >
            Perder
          </button>
        </div>
      )}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(59, 130, 246, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
      `}</style>
    </div>
  )
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
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
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
        border: isOver ? '2px solid #3b82f6' : '1px solid #e5e5e5',
        borderRadius: 10,
        padding: 12,
        background: isOver ? '#eff6ff' : '#f9fafb',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <strong style={{ color: isOver ? '#1d4ed8' : 'inherit' }}>{title}</strong>
        <span style={{ opacity: 0.7 }}>{count}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

export function KanbanBoard({ pipelines, stages, leads, defaultPipelineId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localLeads, setLocalLeads] = useState<LeadRow[]>(leads)

  // Sync with server leads when they change (prop updates)
  useEffect(() => {
    setLocalLeads(leads)
  }, [leads])

  const [pipelineId, setPipelineId] = useState<string>(
    defaultPipelineId ?? pipelines?.[0]?.id ?? ''
  )

  const columns = useMemo(() => {
    return stages
      .filter((s) => s.pipeline_id === pipelineId)
      .sort((a, b) => a.position - b.position)
  }, [stages, pipelineId])

  const pipelineLeads = useMemo(() => {
    return localLeads.filter((l) => l.pipeline_id === pipelineId && l.status === 'open')
  }, [localLeads, pipelineId])

  const activeLead = useMemo(() => {
    return pipelineLeads.find(l => l.id === activeId) || null
  }, [pipelineLeads, activeId])

  const leadsByStage = useMemo(() => {
    const map = new Map<string, LeadRow[]>()
    for (const l of pipelineLeads) {
      const arr = map.get(l.stage_id) ?? []
      arr.push(l)
      map.set(l.stage_id, arr)
    }
    return map
  }, [pipelineLeads])

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const leadId = String(active.id)
    const toStageId = String(over.id)

    const lead = pipelineLeads.find((l) => l.id === leadId)
    if (!lead) return
    if (lead.status !== 'open') return
    if (lead.stage_id === toStageId) return
    if (!columns.some((c) => c.id === toStageId)) return

    const originalStageId = lead.stage_id

    // Optimistic Update: move in local state
    setLocalLeads(prev => prev.map(l => 
      l.id === leadId ? { ...l, stage_id: toStageId } : l
    ))

    startTransition(async () => {
      try {
        await moveLeadToStageAction({ leadId, pipelineId, toStageId })
        router.refresh()
      } catch (err: any) {
        console.error('[onDragEnd] error:', err)
        // Rollback on error
        setLocalLeads(prev => prev.map(l => 
          l.id === leadId ? { ...l, stage_id: originalStageId } : l
        ))
        alert(err?.message ?? 'Erro ao mover lead. A alteração foi revertida.')
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

      <DndContext 
        collisionDetection={closestCenter} 
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
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
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {items.map((l) => (
                    <DraggableCard key={l.id} id={l.id} disabled={isPending || l.status !== 'open'}>
                      <LeadCard 
                        lead={l} 
                        disabled={isPending || l.status !== 'open'} 
                        isOptimistic={isPending && activeId === null && leads.find(sl => sl.id === l.id)?.stage_id !== l.stage_id}
                        onFinalize={onFinalizeLead} 
                      />
                    </DraggableCard>
                  ))}
                </SortableContext>

                {!items.length && <div style={{ fontSize: 12, opacity: 0.6 }}>Sem leads</div>}
              </DroppableColumn>
            )
          })}
        </div>
        <DragOverlay dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: {
                opacity: '0.5',
              },
            },
          }),
        }}>
          {activeLead ? (
            <LeadCard lead={activeLead} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
