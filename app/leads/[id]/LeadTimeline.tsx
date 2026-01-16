'use client'

import { useMemo } from 'react'
import { ClientDate } from '../ClientDate'
import type { AuditLogRow, ActorProfile } from './page'

type StageRow = {
  id: string
  pipeline_id: string
  name: string
  position: number
}

interface LeadTimelineProps {
  createdAt: string
  status: string
  stages: StageRow[]
  auditLogs: AuditLogRow[]
  actorProfiles: ActorProfile[]
}

function truncateId(id: string): string {
  if (!id) return '—'
  return id.substring(0, 8) + '…'
}

const TASK_TYPE_LABELS: Record<string, string> = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  proposal: 'Proposta',
  email: 'Email',
  other: 'Outro',
}

function formatTaskDueAt(dueAt: unknown): string {
  if (!dueAt) return '—'
  try {
    const d = new Date(String(dueAt))
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function summarizeAuditEvent(
  log: AuditLogRow, 
  stages: Map<string, StageRow>
): { title: string; details: string | null; icon: 'create' | 'update' | 'move' | 'status' | 'delete' | 'task' | 'note' } {
  const { action, before, after } = log

  if (action === 'create') {
    return { title: 'Lead criado', details: null, icon: 'create' }
  }

  if (action === 'delete') {
    return { title: 'Lead removido', details: null, icon: 'delete' }
  }

  if (action === 'update' && after?.note_added) {
    const preview = after?.note_preview ? String(after.note_preview) : null
    return {
      title: 'Nota adicionada',
      details: preview ? (preview.length > 40 ? preview.substring(0, 40) + '...' : preview) : null,
      icon: 'note'
    }
  }

  if (action === 'task_create') {
    const taskType = TASK_TYPE_LABELS[String(after?.type)] || String(after?.type)
    const dueAt = formatTaskDueAt(after?.due_at)
    return {
      title: 'Próxima ação criada',
      details: `${taskType} em ${dueAt}`,
      icon: 'task'
    }
  }

  if (action === 'task_done') {
    const taskType = TASK_TYPE_LABELS[String(after?.type)] || String(after?.type)
    return {
      title: 'Tarefa concluída',
      details: taskType,
      icon: 'task'
    }
  }

  if (action === 'task_reschedule') {
    const beforeDue = formatTaskDueAt(before?.due_at)
    const afterDue = formatTaskDueAt(after?.due_at)
    return {
      title: 'Tarefa reagendada',
      details: `${beforeDue} → ${afterDue}`,
      icon: 'task'
    }
  }

  if (action === 'task_cancel') {
    const taskType = TASK_TYPE_LABELS[String(before?.type)] || String(before?.type)
    return {
      title: 'Tarefa cancelada',
      details: taskType,
      icon: 'task'
    }
  }

  if (action === 'move_stage') {
    const fromStage = stages.get(String(before?.stage_id || ''))
    const toStage = stages.get(String(after?.stage_id || ''))
    return {
      title: 'Movido de etapa',
      details: `${fromStage?.name || '—'} → ${toStage?.name || '—'}`,
      icon: 'move'
    }
  }

  if (action === 'update') {
    const changes: string[] = []
    
    if (before?.stage_id !== after?.stage_id) {
      const fromStage = stages.get(String(before?.stage_id || ''))
      const toStage = stages.get(String(after?.stage_id || ''))
      changes.push(`Etapa: ${fromStage?.name || '—'} → ${toStage?.name || '—'}`)
    }
    
    if (before?.status !== after?.status) {
      const statusLabels: Record<string, string> = {
        open: 'Aberto',
        won: 'Comprou',
        lost: 'Não Comprou'
      }
      const fromStatus = statusLabels[String(before?.status)] || String(before?.status)
      const toStatus = statusLabels[String(after?.status)] || String(after?.status)
      changes.push(`Status: ${fromStatus} → ${toStatus}`)
    }
    
    if (before?.title !== after?.title) {
      changes.push('Título alterado')
    }

    if (before?.assigned_to !== after?.assigned_to) {
      changes.push('Responsável alterado')
    }

    if (changes.length === 0) {
      changes.push('Dados atualizados')
    }

    const hasStatusChange = before?.status !== after?.status
    const hasStageChange = before?.stage_id !== after?.stage_id

    return {
      title: hasStatusChange ? 'Status alterado' : hasStageChange ? 'Etapa alterada' : 'Lead atualizado',
      details: changes.join(' • '),
      icon: hasStatusChange ? 'status' : hasStageChange ? 'move' : 'update'
    }
  }

  return { title: 'Ação registrada', details: action, icon: 'update' }
}

function TimelineIcon({ type, status }: { type: string; status?: string }) {
  const baseClass = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10'
  
  switch (type) {
    case 'create':
      return (
        <div className={`${baseClass} bg-[var(--primary)]`}>
          <svg className="w-4 h-4 text-[var(--primary-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
      )
    case 'move':
      return (
        <div className={`${baseClass} bg-[var(--accent)]`}>
          <svg className="w-4 h-4 text-[var(--accent-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      )
    case 'status':
      const isWon = status === 'won'
      const isLost = status === 'lost'
      return (
        <div className={`${baseClass} ${isWon ? 'bg-[var(--success)]' : isLost ? 'bg-[var(--destructive)]' : 'bg-[var(--warning)]'}`}>
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isWon ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            ) : isLost ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
        </div>
      )
    case 'update':
      return (
        <div className={`${baseClass} bg-[var(--muted)]`}>
          <svg className="w-4 h-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
      )
    case 'delete':
      return (
        <div className={`${baseClass} bg-[var(--destructive)]`}>
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
      )
    case 'task':
      return (
        <div className={`${baseClass} bg-[var(--primary)]/80`}>
          <svg className="w-4 h-4 text-[var(--primary-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
      )
    case 'note':
      return (
        <div className={`${baseClass} bg-[var(--info)]`}>
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
      )
    default:
      return (
        <div className={`${baseClass} bg-[var(--muted)]`}>
          <svg className="w-4 h-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      )
  }
}

function deduplicateTimelineEvents(logs: AuditLogRow[]): AuditLogRow[] {
  const moveStageEvents = new Set<string>()
  
  for (const log of logs) {
    if (log.action === 'move_stage') {
      const fromId = String(log.before?.stage_id || '')
      const toId = String(log.after?.stage_id || '')
      const ts = Math.floor(new Date(log.created_at).getTime() / 1000)
      for (let delta = -2; delta <= 2; delta++) {
        moveStageEvents.add(`${fromId}:${toId}:${ts + delta}`)
      }
    }
  }
  
  return logs.filter(log => {
    if (log.action !== 'update') return true
    
    const before = log.before as Record<string, unknown> | null
    const after = log.after as Record<string, unknown> | null
    if (!before || !after) return true
    
    const fromId = String(before.stage_id || '')
    const toId = String(after.stage_id || '')
    if (fromId === toId) return true
    
    const fieldsToCheck = ['status', 'title', 'client_name', 'phone_e164', 'notes', 'assigned_to', 'pipeline_id', 'lead_type_id', 'lead_interest_id', 'lead_source_id', 'budget_range']
    const hasOtherChanges = fieldsToCheck.some(f => before[f] !== after[f])
    if (hasOtherChanges) return true
    
    const ts = Math.floor(new Date(log.created_at).getTime() / 1000)
    const key = `${fromId}:${toId}:${ts}`
    return !moveStageEvents.has(key)
  })
}

export function LeadTimeline({ createdAt, status, stages, auditLogs, actorProfiles }: LeadTimelineProps) {
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages])
  const profileMap = useMemo(() => new Map(actorProfiles.map(p => [p.id, p])), [actorProfiles])

  function getActorDisplay(actorId: string): string {
    const profile = profileMap.get(actorId)
    if (profile?.name) return profile.name
    if (profile?.full_name) return profile.full_name
    if (profile?.email) return profile.email.split('@')[0]
    return truncateId(actorId)
  }

  const filteredLogs = useMemo(() => deduplicateTimelineEvents(auditLogs), [auditLogs])
  const reversedLogs = useMemo(() => [...filteredLogs].reverse(), [filteredLogs])

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[var(--border)]" />
      
      <div className="space-y-6">
        {filteredLogs.length === 0 && (
          <div className="relative flex gap-4">
            <TimelineIcon type="create" />
            <div className="pt-1">
              <p className="text-sm font-medium text-[var(--foreground)]">
                Lead criado
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                <ClientDate value={createdAt} />
              </p>
            </div>
          </div>
        )}

        {reversedLogs.map((log) => {
          const summary = summarizeAuditEvent(log, stageMap)
          const afterStatus = log.after?.status as string | undefined

          return (
            <div key={log.id} className="relative flex gap-4">
              <TimelineIcon type={summary.icon} status={afterStatus} />
              <div className="pt-1 min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {summary.title}
                </p>
                {summary.details && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">
                    {summary.details}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    <ClientDate value={log.created_at} />
                  </span>
                  {log.actor_id && (
                    <>
                      <span className="text-xs text-[var(--muted-foreground)]">•</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {getActorDisplay(log.actor_id)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {status !== 'open' && filteredLogs.length === 0 && (
          <div className="relative flex gap-4">
            <TimelineIcon type="status" status={status} />
            <div className="pt-1">
              <p className="text-sm font-medium text-[var(--foreground)]">
                Lead marcado como{' '}
                <span className={status === 'won' ? 'text-[var(--success)]' : 'text-[var(--destructive)]'}>
                  {status === 'won' ? 'Comprou' : 'Não Comprou'}
                </span>
              </p>
            </div>
          </div>
        )}

        {filteredLogs.length === 0 && status === 'open' && (
          <div className="relative flex gap-4 mt-4">
            <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center flex-shrink-0 z-10">
              <svg className="w-4 h-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="pt-1">
              <p className="text-sm text-[var(--muted-foreground)]">
                Nenhuma alteração registrada ainda.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
