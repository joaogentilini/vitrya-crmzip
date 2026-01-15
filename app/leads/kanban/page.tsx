export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { KanbanBoard } from './KanbanBoard'
import { LeadsAppShell } from '../LeadsAppShell'
import { EmptyState, emptyStateIcons } from '@/components/ui/EmptyState'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { ensureUserProfile } from '@/lib/auth'

export default async function LeadsKanbanPage() {
  const profile = await ensureUserProfile()
  if (!profile) {
    redirect('/')
  }
  
  if (!profile.is_active) {
    redirect('/blocked')
  }

  const userEmail = profile.email
  const supabase = await createClient()

  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })

  const pipelineId = pipelines?.[0]?.id ?? null

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id, name, position')
    .order('position', { ascending: true })

  const { data: leads } = await supabase
    .from('leads')
    .select('id, title, status, pipeline_id, stage_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const leadIds = (leads ?? []).map(l => l.id)
  let taskStatusMap: Map<string, { lead_id: string; is_overdue: boolean; has_open_task: boolean }> = new Map()

  if (leadIds.length > 0) {
    const { data: tasksRaw } = await supabase
      .from('tasks')
      .select('lead_id, due_at')
      .eq('status', 'open')
      .in('lead_id', leadIds)
      .order('due_at', { ascending: true })

    if (tasksRaw) {
      const now = new Date()
      const tasksByLead = new Map<string, { due_at: string }[]>()
      
      for (const task of tasksRaw) {
        const existing = tasksByLead.get(task.lead_id) || []
        existing.push(task)
        tasksByLead.set(task.lead_id, existing)
      }

      for (const leadId of leadIds) {
        const leadTasks = tasksByLead.get(leadId) || []
        const nextTask = leadTasks[0]
        const isOverdue = nextTask ? new Date(nextTask.due_at) < now : false
        
        taskStatusMap.set(leadId, {
          lead_id: leadId,
          is_overdue: isOverdue,
          has_open_task: leadTasks.length > 0
        })
      }
    }
  }

  const taskStatus = Array.from(taskStatusMap.values())

  const hasData = pipelines && pipelines.length > 0 && stages && stages.length > 0

  return (
    <LeadsAppShell userEmail={userEmail} pageTitle="Kanban">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Kanban
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Visualize e gerencie seus leads por etapas
          </p>
        </div>

        {hasData ? (
          <KanbanBoard
            pipelines={pipelines ?? []}
            stages={stages ?? []}
            leads={leads ?? []}
            defaultPipelineId={pipelineId}
            taskStatus={taskStatus}
          />
        ) : (
          <EmptyState
            title="Nenhum pipeline configurado"
            description="Configure um pipeline com estágios para começar a usar o Kanban."
            icon={emptyStateIcons.kanban}
            action={
              <Link href="/leads">
                <Button>Ir para Leads</Button>
              </Link>
            }
          />
        )}
      </div>
    </LeadsAppShell>
  )
}
