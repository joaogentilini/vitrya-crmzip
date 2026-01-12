'use client'

import React, { useMemo, useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { moveLeadToStageAction } from './actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { 
  normalizeError,
  getConfirmFinalizeMessage,
  getFinalizeSuccessMessage
} from '@/lib/leads'

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
  lead: LeadRow
  isDragging?: boolean
  disabled?: boolean
  isOptimistic?: boolean
  onFinalize?: (leadId: string, status: 'won' | 'lost') => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  function formatDate(value: string | null) {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    if (!mounted) return d.toISOString().split('T')[0]
    return d.toLocaleString()
  }

  return (
    <div
      className={`
        rounded-[var(--radius)] border bg-[var(--card)] p-3
        ${isDragging ? 'shadow-lg ring-2 ring-[var(--primary)]' : 'shadow-sm'}
        ${isOptimistic ? 'border-dashed border-[var(--primary)]' : 'border-[var(--border)]'}
        ${disabled || isOptimistic ? 'opacity-60' : ''}
        transition-all duration-200
      `}
    >
      {isOptimistic && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
      )}
      <Link 
        href={`/leads/${lead.id}`}
        className="font-medium text-[var(--card-foreground)] text-sm hover:text-[var(--primary)] hover:underline block"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {lead.title}
      </Link>
      <p className="text-xs text-[var(--muted-foreground)] mt-1">
        {formatDate(lead.created_at)}
      </p>

      {lead.status === 'open' && onFinalize && (
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="default"
            disabled={disabled || isOptimistic}
            className="flex-1 text-xs bg-[var(--success)] hover:bg-[var(--success)]/90"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFinalize(lead.id, 'won')
            }}
          >
            Ganhar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={disabled || isOptimistic}
            className="flex-1 text-xs"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFinalize(lead.id, 'lost')
            }}
          >
            Perder
          </Button>
        </div>
      )}
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
  isOver,
  children,
}: {
  id: string
  title: string
  count: number
  isOver?: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver: droppableIsOver } = useDroppable({ id })
  const active = isOver ?? droppableIsOver

  return (
    <div
      ref={setNodeRef}
      className={`
        min-w-[280px] max-w-[320px] rounded-[var(--radius-lg)] p-4
        ${active 
          ? 'bg-[var(--primary)]/5 border-2 border-[var(--primary)]' 
          : 'bg-[var(--muted)]/50 border border-[var(--border)]'
        }
        transition-all duration-200
      `}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-semibold text-sm ${active ? 'text-[var(--primary)]' : 'text-[var(--foreground)]'}`}>
          {title}
        </h3>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 min-h-[100px]">{children}</div>
    </div>
  )
}

export function KanbanBoard({ pipelines, stages, leads, defaultPipelineId }: Props) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localLeads, setLocalLeads] = useState<LeadRow[]>(leads)

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
    if (!lead || lead.status !== 'open' || lead.stage_id === toStageId) return
    if (!columns.some((c) => c.id === toStageId)) return

    const originalStageId = lead.stage_id
    setLocalLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: toStageId } : l))

    startTransition(async () => {
      try {
        await moveLeadToStageAction({ leadId, pipelineId, fromStageId: originalStageId, toStageId })
        success('Lead movido com sucesso!')
        router.refresh()
      } catch (err: unknown) {
        setLocalLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: originalStageId } : l))
        showError(normalizeError(err, 'Erro ao mover lead.'))
      }
    })
  }

  function onFinalizeLead(leadId: string, status: 'won' | 'lost') {
    if (!confirm(getConfirmFinalizeMessage(status))) return
    
    startTransition(async () => {
      try {
        const resp = await fetch('/api/leads/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId, status }),
        })
        if (!resp.ok) throw new Error('Erro ao finalizar lead')
        success(getFinalizeSuccessMessage(status))
        router.refresh()
      } catch (err: unknown) {
        showError(normalizeError(err, 'Erro ao finalizar lead.'))
      }
    })
  }

  if (pipelines.length === 0) {
    return (
      <EmptyState
        title="Nenhum pipeline encontrado"
        description="Configure um pipeline para começar a usar o Kanban."
        icon={
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-[var(--foreground)]">Pipeline:</label>
        <select 
          value={pipelineId} 
          onChange={(e) => setPipelineId(e.target.value)} 
          disabled={isPending}
          className="h-9 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <DndContext collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const items = (leadsByStage.get(col.id) ?? []).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
            return (
              <DroppableColumn key={col.id} id={col.id} title={col.name} count={items.length}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {items.map((l) => (
                    <DraggableCard key={l.id} id={l.id} disabled={isPending}>
                      <LeadCard 
                        lead={l} 
                        disabled={isPending} 
                        isOptimistic={isPending && activeId === null && leads.find(sl => sl.id === l.id)?.stage_id !== l.stage_id} 
                        onFinalize={onFinalizeLead} 
                      />
                    </DraggableCard>
                  ))}
                </SortableContext>
                {!items.length && (
                  <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
                    Sem leads nesta etapa
                  </p>
                )}
              </DroppableColumn>
            )
          })}
        </div>
        <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }) }}>
          {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
