'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'
import { completeTaskAction, rescheduleTaskAction } from '@/app/leads/tasks/actions'

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
  userEmail?: string | null
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

const taskTypeIcons: Record<string, string> = {
  call: '📞',
  whatsapp: '💬',
  visit: '🏠',
  proposal: '📄',
  email: '✉️',
  other: '📌',
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function groupTasksByDay(tasks: Task[]) {
  const groups: Record<string, Task[]> = {}
  
  for (const task of tasks) {
    const date = new Date(task.due_at)
    const dayKey = date.toISOString().split('T')[0]
    if (!groups[dayKey]) groups[dayKey] = []
    groups[dayKey].push(task)
  }
  
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

export function AgendaClient({ userEmail, isAdmin, profiles, selectedBroker, view, data }: AgendaClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null)
  const [newDueAt, setNewDueAt] = useState('')

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const handleViewChange = (newView: string) => {
    const params = new URLSearchParams()
    if (selectedBroker) params.set('broker', selectedBroker)
    if (newView !== 'today') params.set('view', newView)
    router.push(`/agenda${params.toString() ? '?' + params.toString() : ''}`)
  }

  const handleBrokerChange = (brokerId: string) => {
    const params = new URLSearchParams()
    if (brokerId !== 'all') params.set('broker', brokerId)
    if (view !== 'today') params.set('view', view)
    router.push(`/agenda${params.toString() ? '?' + params.toString() : ''}`)
  }

  const handleComplete = (taskId: string) => {
    startTransition(async () => {
      try {
        await completeTaskAction(taskId)
        success('Tarefa concluída!')
        router.refresh()
      } catch (err) {
        showError('Erro ao concluir tarefa')
      }
    })
  }

  const handleReschedule = (taskId: string) => {
    if (rescheduleTaskId === taskId && newDueAt) {
      startTransition(async () => {
        try {
          await rescheduleTaskAction({ taskId, dueAt: newDueAt })
          success('Tarefa reagendada!')
          setRescheduleTaskId(null)
          setNewDueAt('')
          router.refresh()
        } catch (err) {
          showError('Erro ao reagendar tarefa')
        }
      })
    } else {
      setRescheduleTaskId(taskId)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(10, 0, 0, 0)
      setNewDueAt(tomorrow.toISOString().slice(0, 16))
    }
  }

  const getLeadTitle = (leadId: string) => {
    return data.leads.find(l => l.id === leadId)?.title || 'Lead'
  }

  const groupedTasks = groupTasksByDay(data.tasks)

  return (
    <AppShell
      userEmail={userEmail}
      onSignOut={handleSignOut}
      pageTitle="Agenda"
      showNewLeadButton={true}
      onNewLead={() => router.push('/leads#new')}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex rounded-[var(--radius)] border border-[var(--border)] overflow-hidden">
            <button
              onClick={() => handleViewChange('today')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'today'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => handleViewChange('week')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'week'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]'
              }`}
            >
              Semana
            </button>
          </div>

          {isAdmin && profiles.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[var(--muted-foreground)]">Corretor:</label>
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
          <Card className="border-[var(--destructive)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--destructive)]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Atrasadas ({data.overdueTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.overdueTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    leadTitle={getLeadTitle(task.lead_id)}
                    isOverdue
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
            </CardContent>
          </Card>
        )}

        {groupedTasks.length === 0 && data.overdueTasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <svg className="w-12 h-12 mx-auto text-[var(--muted-foreground)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-[var(--muted-foreground)]">
                {view === 'today' ? 'Nenhuma tarefa para hoje' : 'Nenhuma tarefa para a semana'}
              </p>
            </CardContent>
          </Card>
        ) : (
          groupedTasks.map(([dayKey, tasks]) => (
            <Card key={dayKey}>
              <CardHeader>
                <CardTitle className="text-base">{formatDate(dayKey + 'T00:00:00')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tasks.map((task) => (
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
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  )
}

interface TaskRowProps {
  task: Task
  leadTitle: string
  isOverdue?: boolean
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
  isOverdue, 
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
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-[var(--radius)] ${isOverdue ? 'bg-red-50' : 'bg-[var(--muted)]'} gap-3`}>
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        <span className="text-xl shrink-0">{taskTypeIcons[task.type] || '📌'}</span>
        <div className="min-w-0 flex-1">
          <Link 
            href={`/leads/${task.lead_id}`} 
            className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] block truncate"
          >
            {leadTitle}
          </Link>
          <p className="text-xs text-[var(--muted-foreground)]">{task.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={isOverdue ? 'destructive' : 'outline'} className="text-xs">
              {taskTypeLabels[task.type] || task.type}
            </Badge>
            <span className="text-xs text-[var(--muted-foreground)]">
              {formatTime(task.due_at)}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 shrink-0">
        {isRescheduling ? (
          <>
            <input
              type="datetime-local"
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
              className="px-2 py-1 text-sm border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)]"
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
  )
}
