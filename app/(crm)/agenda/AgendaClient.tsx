'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'
import { completeTaskAction, rescheduleTaskAction } from '@/app/(crm)/leads/tasks/actions'

interface Profile {
  id: string
  full_name: string | null
}

interface Lead {
  id: string
  title: string
}

interface Task {
  id: string
  lead_id: string
  title: string
  type: string
  due_at: string
  status: string
  assigned_to: string
}

interface AgendaData {
  tasks: Task[]
  overdueTasks: Task[]
  leads: Lead[]
}

interface AgendaClientProps {
  isAdmin: boolean
  profiles: Profile[]
  selectedBroker?: string
  view: 'today' | 'week'
  data: AgendaData
}

const taskTypeLabels: Record<string, string> = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  proposal: 'Proposta',
  email: 'E-mail',
  other: 'Outro',
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR')
}

export function AgendaClient({ isAdmin, profiles, selectedBroker, view, data }: AgendaClientProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const [isPending, startTransition] = useTransition()
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null)
  const [newDueAt, setNewDueAt] = useState('')

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const handleBrokerChange = (brokerId: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set('broker', brokerId)
    router.push(`/agenda?${params.toString()}`)
  }

  const handleViewChange = (newView: 'today' | 'week') => {
    const params = new URLSearchParams(window.location.search)
    params.set('view', newView)
    router.push(`/agenda?${params.toString()}`)
  }

  const handleComplete = useCallback(async (taskId: string) => {
    startTransition(async () => {
      try {
        await completeTaskAction(taskId)
        success('Tarefa concluída!')
        router.refresh()
      } catch (err) {
        error('Erro ao concluir tarefa')
      }
    })
  }, [success, error, router])

  const handleReschedule = useCallback(async (taskId: string) => {
    if (!newDueAt) return

    startTransition(async () => {
      try {
        await rescheduleTaskAction({ taskId, dueAt: newDueAt })
        success('Tarefa reagendada!')
        setRescheduleTaskId(null)
        setNewDueAt('')
        router.refresh()
      } catch (err) {
        error('Erro ao reagendar tarefa')
      }
    })
  }, [newDueAt, success, error, router])

  const getLeadTitle = (leadId: string) => {
    const lead = data.leads.find(l => l.id === leadId)
    return lead?.title || 'Lead'
  }

  const todayTasks = data.tasks.filter(task => {
    const taskDate = new Date(task.due_at).toDateString()
    const today = new Date().toDateString()
    return taskDate === today
  })

  const weekTasks = data.tasks.filter(task => {
    const taskDate = new Date(task.due_at)
    const today = new Date()
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    return taskDate >= today && taskDate <= weekFromNow
  })

  const displayedTasks = view === 'today' ? todayTasks : weekTasks

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Agenda</h1>
          <div className="flex gap-2">
            <Button
              variant={view === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleViewChange('today')}
            >
              Hoje
            </Button>
            <Button
              variant={view === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleViewChange('week')}
            >
              Semana
            </Button>
          </div>
        </div>

        {isAdmin && profiles.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-[var(--muted-foreground)]">Filtrar por corretor:</label>
            <select
              value={selectedBroker || 'all'}
              onChange={(e) => handleBrokerChange(e.target.value)}
              className="px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="all">Todos</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {data.overdueTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[var(--destructive)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tarefas Atrasadas ({data.overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.overdueTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--muted)]">
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${task.lead_id}`} className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] truncate block">
                      {getLeadTitle(task.lead_id)}
                    </Link>
                    <p className="text-xs text-[var(--muted-foreground)]">{task.title}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Badge variant="outline" className="text-xs">{taskTypeLabels[task.type] || task.type}</Badge>
                    <span className="text-xs text-[var(--muted-foreground)]">{formatDate(task.due_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {view === 'today' ? 'Tarefas de Hoje' : 'Tarefas da Semana'} ({displayedTasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {displayedTasks.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {view === 'today' ? 'Nenhuma tarefa para hoje' : 'Nenhuma tarefa para esta semana'}
            </p>
          ) : (
            <div className="space-y-3">
              {displayedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  leadTitle={getLeadTitle(task.lead_id)}
                  isPending={isPending}
                  rescheduleTaskId={rescheduleTaskId}
                  newDueAt={newDueAt}
                  setNewDueAt={setNewDueAt}
                  onComplete={handleComplete}
                  onReschedule={handleReschedule}
                  onCancelReschedule={() => setRescheduleTaskId(null)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface TaskRowProps {
  task: Task
  leadTitle: string
  isPending: boolean
  rescheduleTaskId: string | null
  newDueAt: string
  setNewDueAt: (value: string) => void
  onComplete: (taskId: string) => void
  onReschedule: (taskId: string) => void
  onCancelReschedule: () => void
}

function TaskRow({
  task,
  leadTitle,
  isPending,
  rescheduleTaskId,
  newDueAt,
  setNewDueAt,
  onComplete,
  onReschedule,
  onCancelReschedule
}: TaskRowProps) {
  const isRescheduling = rescheduleTaskId === task.id

  return (
    <div className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors">
      <div className="min-w-0 flex-1">
        <Link href={`/leads/${task.lead_id}`} className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] truncate block">
          {leadTitle}
        </Link>
        <p className="text-xs text-[var(--muted-foreground)]">{task.title}</p>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <Badge variant="outline" className="text-xs">{taskTypeLabels[task.type] || task.type}</Badge>
        <span className="text-xs text-[var(--muted-foreground)]">{formatTime(task.due_at)}</span>
        <div className="flex gap-1">
          {isRescheduling ? (
            <>
              <input
                type="datetime-local"
                value={newDueAt}
                onChange={(e) => setNewDueAt(e.target.value)}
                className="px-2 py-1 text-xs border border-[var(--border)] rounded"
              />
              <Button size="sm" onClick={() => onReschedule(task.id)} loading={isPending}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelReschedule}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => onReschedule(task.id)} disabled={isPending}>
                Reagendar
              </Button>
              <Button size="sm" onClick={() => onComplete(task.id)} loading={isPending}>
                Concluir
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
