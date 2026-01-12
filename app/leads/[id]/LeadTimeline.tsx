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

function summarizeAuditEvent(
  log: AuditLogRow, 
  stages: Map<string, StageRow>
): { title: string; details: string | null; icon: 'create' | 'update' | 'move' | 'status' | 'delete' } {
  const { action, before, after } = log

  if (action === 'create') {
    return { title: 'Lead criado', details: null, icon: 'create' }
  }

  if (action === 'delete') {
    return { title: 'Lead removido', details: null, icon: 'delete' }
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
        won: 'Ganho',
        lost: 'Perdido'
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

function filterDuplicateStageUpdates(logs: AuditLogRow[]): AuditLogRow[] {
  const moveStageKeys = new Set<string>()
  
  for (const log of logs) {
    if (log.action === 'move_stage') {
      const fromId = String(log.before?.stage_id || '')
      const toId = String(log.after?.stage_id || '')
      const time = new Date(log.created_at).getTime()
      moveStageKeys.add(`${fromId}:${toId}:${Math.floor(time / 5000)}`)
      moveStageKeys.add(`${fromId}:${toId}:${Math.floor(time / 5000) + 1}`)
      moveStageKeys.add(`${fromId}:${toId}:${Math.floor(time / 5000) - 1}`)
    }
  }

  return logs.filter(log => {
    if (log.action !== 'update') return true

    const beforeStageId = log.before?.stage_id
    const afterStageId = log.after?.stage_id
    if (beforeStageId === afterStageId) return true

    const changedFields = new Set<string>()
    if (log.before?.stage_id !== log.after?.stage_id) changedFields.add('stage_id')
    if (log.before?.status !== log.after?.status) changedFields.add('status')
    if (log.before?.title !== log.after?.title) changedFields.add('title')
    if (log.before?.assigned_to !== log.after?.assigned_to) changedFields.add('assigned_to')
    if (log.before?.pipeline_id !== log.after?.pipeline_id) changedFields.add('pipeline_id')

    if (changedFields.size > 1 || !changedFields.has('stage_id')) return true

    const time = new Date(log.created_at).getTime()
    const key = `${String(beforeStageId)}:${String(afterStageId)}:${Math.floor(time / 5000)}`
    
    return !moveStageKeys.has(key)
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

  const filteredLogs = useMemo(() => filterDuplicateStageUpdates(auditLogs), [auditLogs])
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
                  {status === 'won' ? 'Ganho' : 'Perdido'}
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
