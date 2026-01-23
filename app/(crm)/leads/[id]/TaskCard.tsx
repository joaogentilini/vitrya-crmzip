'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { normalizeError } from '@/lib/leads'
import { completeTaskAction, rescheduleTaskAction, cancelTaskAction } from '../tasks/actions'
import { CreateTaskModal } from './CreateTaskModal'
import { ClientDate } from '../ClientDate'

export interface TaskRow {
  id: string
  lead_id: string
  title: string
  type: 'call' | 'whatsapp' | 'visit' | 'proposal' | 'email' | 'other'
  due_at: string
  status: 'open' | 'done' | 'canceled'
  notes: string | null
  assigned_to: string
  created_by: string
  created_at: string
}

export interface ProfileRow {
  id: string
  full_name: string | null
  name?: string | null
  email?: string | null
}

interface TaskCardProps {
  leadId: string
  tasks: TaskRow[]
  profiles: ProfileRow[]
  isAdmin: boolean
}

const TASK_TYPE_LABELS: Record<string, string> = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  proposal: 'Proposta',
  email: 'Email',
  other: 'Outro',
}

const TASK_TYPE_COLORS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  call: 'default',
  whatsapp: 'success',
  visit: 'warning',
  proposal: 'secondary',
  email: 'secondary',
  other: 'secondary',
}

function truncateId(id: string): string {
  if (!id) return '—'
  return id.substring(0, 8) + '…'
}

function getAssigneeName(assignedTo: string, profiles: ProfileRow[]): string {
  const profile = profiles.find(p => p.id === assignedTo)
  if (profile?.full_name) return profile.full_name
  if (profile?.name) return profile.name
  if (profile?.email) return profile.email.split('@')[0]
  return truncateId(assignedTo)
}

export function TaskCard({ leadId, tasks, profiles, isAdmin }: TaskCardProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null)
  const [newDueAt, setNewDueAt] = useState('')

  const openTasks = tasks.filter(t => t.status === 'open').sort((a, b) => 
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  )
  const nextTask = openTasks[0]
  const isOverdue = nextTask ? new Date(nextTask.due_at) < new Date() : false

  function handleComplete(taskId: string) {
    startTransition(async () => {
      try {
        await completeTaskAction(taskId)
        success('Tarefa concluída!')
        router.refresh()
      } catch (err) {
        showError(normalizeError(err, 'Erro ao concluir tarefa.'))
      }
    })
  }

  function handleCancel(taskId: string) {
    if (!confirm('Deseja cancelar esta tarefa?')) return
    startTransition(async () => {
      try {
        await cancelTaskAction(taskId)
        success('Tarefa cancelada.')
        router.refresh()
      } catch (err) {
        showError(normalizeError(err, 'Erro ao cancelar tarefa.'))
      }
    })
  }

  function handleReschedule() {
    if (!rescheduleTaskId || !newDueAt) return
    startTransition(async () => {
      try {
        await rescheduleTaskAction({ taskId: rescheduleTaskId, dueAt: newDueAt })
        success('Tarefa reagendada!')
        setRescheduleTaskId(null)
        setNewDueAt('')
        router.refresh()
      } catch (err) {
        showError(normalizeError(err, 'Erro ao reagendar tarefa.'))
      }
    })
  }

  return (
    <>
      <Card className={isOverdue ? 'border-[var(--destructive)]' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              Próxima Ação
              {isOverdue && (
                <Badge variant="destructive" className="text-xs">Atrasada</Badge>
              )}
            </CardTitle>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setCreateModalOpen(true)}
              disabled={isPending}
            >
              + Nova
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!nextTask ? (
            <div className="text-center py-6">
              <p className="text-sm text-[var(--muted-foreground)] mb-3">
                Sem próxima ação agendada
              </p>
              <Button 
                size="sm" 
                onClick={() => setCreateModalOpen(true)}
                disabled={isPending}
              >
                Criar próxima ação
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Badge variant={TASK_TYPE_COLORS[nextTask.type]} className="mt-0.5">
                  {TASK_TYPE_LABELS[nextTask.type]}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-[var(--foreground)] truncate">
                    {nextTask.title}
                  </p>
                  <p className={`text-xs mt-0.5 ${isOverdue ? 'text-[var(--destructive)] font-medium' : 'text-[var(--muted-foreground)]'}`}>
                    <ClientDate value={nextTask.due_at} />
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    Responsável: {getAssigneeName(nextTask.assigned_to, profiles)}
                  </p>
                </div>
              </div>

              {rescheduleTaskId === nextTask.id ? (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-[var(--muted-foreground)]">Nova data/hora</label>
                    <input
                      type="datetime-local"
                      value={newDueAt}
                      onChange={(e) => setNewDueAt(e.target.value)}
                      className="w-full h-9 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
                    />
                  </div>
                  <Button size="sm" onClick={handleReschedule} disabled={isPending || !newDueAt}>
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setRescheduleTaskId(null); setNewDueAt('') }}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1 bg-[var(--success)] hover:bg-[var(--success)]/90"
                    onClick={() => handleComplete(nextTask.id)}
                    disabled={isPending}
                  >
                    Concluir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setRescheduleTaskId(nextTask.id)}
                    disabled={isPending}
                  >
                    Reagendar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--destructive)]"
                    onClick={() => handleCancel(nextTask.id)}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                </div>
              )}

              {openTasks.length > 1 && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <p className="text-xs text-[var(--muted-foreground)] mb-2">
                    Outras tarefas abertas ({openTasks.length - 1})
                  </p>
                  <div className="space-y-2">
                    {openTasks.slice(1, 4).map(task => (
                      <div key={task.id} className="flex items-center gap-2 text-xs">
                        <Badge variant={TASK_TYPE_COLORS[task.type]} className="text-xs">
                          {TASK_TYPE_LABELS[task.type]}
                        </Badge>
                        <span className="truncate flex-1">{task.title}</span>
                        <span className="text-[var(--muted-foreground)]">
                          <ClientDate value={task.due_at} format="short" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        leadId={leadId}
        profiles={profiles}
        isAdmin={isAdmin}
      />
    </>
  )
}
