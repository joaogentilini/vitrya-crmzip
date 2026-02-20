import { createClient } from '@/lib/supabaseServer'

export type AutomationKey = 'lead_created_whatsapp' | 'no_action_24h' | 'stale_3d' | 'proposal_stage'

export interface AutomationResult {
  rule: AutomationKey
  tasksCreated: number
  errors: string[]
}

export interface AutomationSetting {
  id: string
  key: AutomationKey
  enabled: boolean
  created_at: string
  updated_at: string
}

export async function getAutomationSettings(): Promise<AutomationSetting[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('automation_settings')
    .select('*')
    .order('key')
  
  if (error) {
    console.error('[Automations] Failed to fetch settings:', error)
    return []
  }
  
  return data || []
}

export async function isAutomationEnabled(key: AutomationKey): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('automation_settings')
    .select('enabled')
    .eq('key', key)
    .single()
  
  return data?.enabled ?? false
}

export async function createAutomationTask(
  leadId: string,
  assignedTo: string,
  actorId: string,
  taskType: 'whatsapp' | 'call' | 'proposal' | 'visit' | 'email' | 'other',
  title: string,
  dueAt: Date,
  automationReason: string
): Promise<{ taskId: string | null; error: string | null }> {
  const supabase = await createClient()

  const { data: task, error: insertError } = await supabase
    .from('tasks')
    .insert({
      lead_id: leadId,
      title: title,
      type: taskType,
      due_at: dueAt.toISOString(),
      notes: `Criado automaticamente: ${automationReason}`,
      assigned_to: assignedTo,
      created_by: actorId,
      status: 'open',
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[Automations] Task insert failed:', insertError)
    return { taskId: null, error: insertError.message }
  }

  console.log('[Automations] Task created:', task.id, leadId, automationReason)

  const { error: auditError } = await supabase.from('lead_audit_logs').insert({
    lead_id: leadId,
    actor_id: actorId,
    action: 'automation_task_create',
    before: null,
    after: {
      reason: automationReason,
      task_id: task.id,
      task_type: taskType,
      title: title,
      due_at: dueAt.toISOString(),
    },
  })

  if (auditError) {
    console.error('[Automations] Audit log failed:', auditError)
  }

  return { taskId: task.id, error: null }
}

export async function runLeadCreatedWhatsapp(systemActorId: string): Promise<AutomationResult> {
  const result: AutomationResult = { rule: 'lead_created_whatsapp', tasksCreated: 0, errors: [] }
  
  const enabled = await isAutomationEnabled('lead_created_whatsapp')
  if (!enabled) {
    result.errors.push('Automation disabled')
    return result
  }

  const supabase = await createClient()
  
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  
  const { data: recentLeads } = await supabase
    .from('leads')
    .select('id, assigned_to, created_by, created_at')
    .gte('created_at', thirtyMinutesAgo)
    .eq('status', 'open')
    .limit(100)

  if (!recentLeads || recentLeads.length === 0) return result

  for (const lead of recentLeads) {
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('type', 'whatsapp')
      .eq('status', 'open')
      .gte('created_at', thirtyMinutesAgo)
      .limit(1)
      .single()

    if (existingTask) continue

    const assignedTo = lead.assigned_to || lead.created_by
    const dueAt = new Date(Date.now() + 10 * 60 * 1000)

    const { error } = await createAutomationTask(
      lead.id,
      assignedTo,
      systemActorId,
      'whatsapp',
      'Enviar WhatsApp inicial',
      dueAt,
      'lead_created'
    )

    if (error) {
      result.errors.push(`Lead ${lead.id}: ${error}`)
    } else {
      result.tasksCreated++
    }
  }

  return result
}

export async function runNoAction24h(systemActorId: string): Promise<AutomationResult> {
  const result: AutomationResult = { rule: 'no_action_24h', tasksCreated: 0, errors: [] }
  
  const enabled = await isAutomationEnabled('no_action_24h')
  if (!enabled) {
    result.errors.push('Automation disabled')
    return result
  }

  const supabase = await createClient()
  
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: oldLeads } = await supabase
    .from('leads')
    .select('id, assigned_to, created_by')
    .lt('created_at', twentyFourHoursAgo)
    .eq('status', 'open')
    .limit(200)

  if (!oldLeads || oldLeads.length === 0) return result

  for (const lead of oldLeads) {
    const { data: openTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('status', 'open')
      .limit(1)

    if (openTasks && openTasks.length > 0) continue

    const { data: recentCallTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('type', 'call')
      .eq('status', 'open')
      .gte('created_at', fortyEightHoursAgo)
      .ilike('title', '%follow-up%')
      .limit(1)

    if (recentCallTask && recentCallTask.length > 0) continue

    const assignedTo = lead.assigned_to || lead.created_by
    const dueAt = new Date(Date.now() + 30 * 60 * 1000)

    const { error } = await createAutomationTask(
      lead.id,
      assignedTo,
      systemActorId,
      'call',
      'Ligação de follow-up (24h sem ação)',
      dueAt,
      'no_open_tasks_24h'
    )

    if (error) {
      result.errors.push(`Lead ${lead.id}: ${error}`)
    } else {
      result.tasksCreated++
    }
  }

  return result
}

export async function runStale3d(systemActorId: string): Promise<AutomationResult> {
  const result: AutomationResult = { rule: 'stale_3d', tasksCreated: 0, errors: [] }
  
  const enabled = await isAutomationEnabled('stale_3d')
  if (!enabled) {
    result.errors.push('Automation disabled')
    return result
  }

  const supabase = await createClient()
  
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, assigned_to, created_by')
    .eq('status', 'open')
    .limit(200)

  if (!leads || leads.length === 0) return result

  for (const lead of leads) {
    const { data: recentActivity } = await supabase
      .from('lead_audit_logs')
      .select('id')
      .eq('lead_id', lead.id)
      .in('action', ['move_stage', 'task_done', 'task_reschedule', 'update'])
      .gte('created_at', threeDaysAgo)
      .limit(1)

    if (recentActivity && recentActivity.length > 0) continue

    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('status', 'open')
      .ilike('title', '%Lead parado 3 dias%')
      .gte('created_at', threeDaysAgo)
      .limit(1)

    if (existingTask && existingTask.length > 0) continue

    const assignedTo = lead.assigned_to || lead.created_by
    const dueAt = new Date(Date.now() + 60 * 60 * 1000)

    const { error } = await createAutomationTask(
      lead.id,
      assignedTo,
      systemActorId,
      'call',
      'Retomada de contato (Lead parado 3 dias)',
      dueAt,
      'stale_lead_3d'
    )

    if (error) {
      result.errors.push(`Lead ${lead.id}: ${error}`)
    } else {
      result.tasksCreated++
    }
  }

  return result
}

export async function runProposalStage(systemActorId: string): Promise<AutomationResult> {
  const result: AutomationResult = { rule: 'proposal_stage', tasksCreated: 0, errors: [] }
  
  const enabled = await isAutomationEnabled('proposal_stage')
  if (!enabled) {
    result.errors.push('Automation disabled')
    return result
  }

  const supabase = await createClient()
  
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: proposalStages } = await supabase
    .from('pipeline_stages')
    .select('id')
    .ilike('name', '%proposta%')

  if (!proposalStages || proposalStages.length === 0) return result

  const stageIds = proposalStages.map((s: any) => s.id)

  const { data: recentMoves } = await supabase
    .from('lead_audit_logs')
    .select('lead_id, after')
    .eq('action', 'move_stage')
    .gte('created_at', oneHourAgo)
    .limit(100)

  if (!recentMoves || recentMoves.length === 0) return result

  const leadsMovedToProposal = recentMoves.filter((m: any) => {
    const afterData = m.after as { stage_id?: string } | null
    return afterData?.stage_id && stageIds.includes(afterData.stage_id)
  })

  for (const move of leadsMovedToProposal) {
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('lead_id', move.lead_id)
      .eq('type', 'proposal')
      .eq('status', 'open')
      .limit(1)

    if (existingTask && existingTask.length > 0) continue

    const { data: lead } = await supabase
      .from('leads')
      .select('assigned_to, created_by')
      .eq('id', move.lead_id)
      .single()

    if (!lead) continue

    const assignedTo = lead.assigned_to || lead.created_by
    const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000)

    const { error } = await createAutomationTask(
      move.lead_id,
      assignedTo,
      systemActorId,
      'proposal',
      'Enviar proposta e confirmar recebimento',
      dueAt,
      'moved_to_proposal_stage'
    )

    if (error) {
      result.errors.push(`Lead ${move.lead_id}: ${error}`)
    } else {
      result.tasksCreated++
    }
  }

  return result
}

export async function runAllAutomations(actorId: string): Promise<AutomationResult[]> {
  const results: AutomationResult[] = []

  results.push(await runLeadCreatedWhatsapp(actorId))
  results.push(await runNoAction24h(actorId))
  results.push(await runStale3d(actorId))
  results.push(await runProposalStage(actorId))

  return results
}
