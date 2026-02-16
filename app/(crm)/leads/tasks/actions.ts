'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'
import { removeTaskFromGoogleCalendar, syncOpenTaskToGoogleCalendar } from '@/lib/integrations/googleCalendarTasks'

export type TaskType = 'call' | 'whatsapp' | 'visit' | 'proposal' | 'email' | 'other'
export type TaskStatus = 'open' | 'done' | 'canceled'

export interface CreateTaskInput {
  leadId: string
  title: string
  type: TaskType
  dueAt: string
  notes?: string
  assignedTo?: string
}

export interface RescheduleTaskInput {
  taskId: string
  dueAt: string
}

async function isUserAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  
  if (error) {
    console.error('[isUserAdmin] Failed to fetch profile:', error)
    return false
  }
  
  return profile?.role === 'admin'
}

async function canAccessLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
  userId: string
): Promise<boolean> {
  const isAdmin = await isUserAdmin(supabase, userId)
  if (isAdmin) return true

  const { data: lead } = await supabase
    .from('leads')
    .select('id, created_by, assigned_to')
    .eq('id', leadId)
    .single()

  if (!lead) return false
  return lead.created_by === userId || lead.assigned_to === userId
}

async function canAccessTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  userId: string
): Promise<{ allowed: boolean; task?: { id: string; lead_id: string; title: string; type: string; due_at: string; status: string; assigned_to: string } }> {
  const isAdmin = await isUserAdmin(supabase, userId)

  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, lead_id, title, type, due_at, status, assigned_to, created_by')
    .eq('id', taskId)
    .single()

  if (error || !task) return { allowed: false }

  if (isAdmin || task.assigned_to === userId || task.created_by === userId) {
    return { allowed: true, task }
  }

  return { allowed: false }
}

export async function createTaskAction(input: CreateTaskInput) {
  const supabase = await createClient()
  
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')
  
  const userId = userRes.user.id

  const hasAccess = await canAccessLead(supabase, input.leadId, userId)
  if (!hasAccess) throw new Error('Sem permissão para criar tarefa neste lead')

  const isAdmin = await isUserAdmin(supabase, userId)
  const assignedTo = isAdmin && input.assignedTo ? input.assignedTo : userId

  const { data: task, error: insertError } = await supabase
    .from('tasks')
    .insert({
      lead_id: input.leadId,
      title: input.title,
      type: input.type,
      due_at: input.dueAt,
      notes: input.notes || null,
      assigned_to: assignedTo,
      created_by: userId,
      status: 'open',
    })
    .select('id, lead_id, title, type, due_at, status, assigned_to')
    .single()

  if (insertError) throw new Error(insertError.message)

  console.log('[createTaskAction] task created', task.id, input.leadId)

  const { error: auditError } = await supabase.from('lead_audit_logs').insert({
    lead_id: input.leadId,
    actor_id: userId,
    action: 'task_create',
    before: null,
    after: {
      task_id: task.id,
      title: task.title,
      type: task.type,
      due_at: task.due_at,
      status: task.status,
      assigned_to: task.assigned_to,
    },
  })

  if (auditError) {
    console.error('[TaskAudit] task_create insert failed:', auditError)
  }

  await syncOpenTaskToGoogleCalendar({
    id: task.id,
    lead_id: task.lead_id,
    title: task.title,
    type: task.type,
    due_at: task.due_at,
    assigned_to: task.assigned_to,
  })

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${input.leadId}`)
  revalidatePath('/agenda')

  return task
}

export async function completeTaskAction(taskId: string) {
  const supabase = await createClient()
  
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')
  
  const userId = userRes.user.id

  const { allowed, task } = await canAccessTask(supabase, taskId, userId)
  if (!allowed || !task) throw new Error('Sem permissão para completar esta tarefa')

  const beforeState = {
    task_id: task.id,
    title: task.title,
    type: task.type,
    due_at: task.due_at,
    status: task.status,
    assigned_to: task.assigned_to,
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update({ status: 'done' })
    .eq('id', taskId)

  if (updateError) throw new Error(updateError.message)

  const { error: auditError } = await supabase.from('lead_audit_logs').insert({
    lead_id: task.lead_id,
    actor_id: userId,
    action: 'task_done',
    before: beforeState,
    after: { ...beforeState, status: 'done' },
  })

  if (auditError) {
    console.error('[TaskAudit] task_done insert failed:', auditError)
  }

  await removeTaskFromGoogleCalendar({
    id: task.id,
    assigned_to: task.assigned_to,
  })

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${task.lead_id}`)
  revalidatePath('/agenda')
}

export async function rescheduleTaskAction(input: RescheduleTaskInput) {
  const supabase = await createClient()
  
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')
  
  const userId = userRes.user.id

  const { allowed, task } = await canAccessTask(supabase, input.taskId, userId)
  if (!allowed || !task) throw new Error('Sem permissão para reagendar esta tarefa')

  const beforeDueAt = task.due_at

  const { error: updateError } = await supabase
    .from('tasks')
    .update({ due_at: input.dueAt })
    .eq('id', input.taskId)

  if (updateError) throw new Error(updateError.message)

  const { error: auditError } = await supabase.from('lead_audit_logs').insert({
    lead_id: task.lead_id,
    actor_id: userId,
    action: 'task_reschedule',
    before: {
      task_id: task.id,
      title: task.title,
      type: task.type,
      due_at: beforeDueAt,
      status: task.status,
      assigned_to: task.assigned_to,
    },
    after: {
      task_id: task.id,
      title: task.title,
      type: task.type,
      due_at: input.dueAt,
      status: task.status,
      assigned_to: task.assigned_to,
    },
  })

  if (auditError) {
    console.error('[TaskAudit] task_reschedule insert failed:', auditError)
  }

  await syncOpenTaskToGoogleCalendar({
    id: task.id,
    lead_id: task.lead_id,
    title: task.title,
    type: task.type,
    due_at: input.dueAt,
    assigned_to: task.assigned_to,
  })

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${task.lead_id}`)
  revalidatePath('/agenda')
}

export async function cancelTaskAction(taskId: string) {
  const supabase = await createClient()
  
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')
  
  const userId = userRes.user.id

  const { allowed, task } = await canAccessTask(supabase, taskId, userId)
  if (!allowed || !task) throw new Error('Sem permissão para cancelar esta tarefa')

  const beforeState = {
    task_id: task.id,
    title: task.title,
    type: task.type,
    due_at: task.due_at,
    status: task.status,
    assigned_to: task.assigned_to,
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update({ status: 'canceled' })
    .eq('id', taskId)

  if (updateError) throw new Error(updateError.message)

  const { error: auditError } = await supabase.from('lead_audit_logs').insert({
    lead_id: task.lead_id,
    actor_id: userId,
    action: 'task_cancel',
    before: beforeState,
    after: { ...beforeState, status: 'canceled' },
  })

  if (auditError) {
    console.error('[TaskAudit] task_cancel insert failed:', auditError)
  }

  await removeTaskFromGoogleCalendar({
    id: task.id,
    assigned_to: task.assigned_to,
  })

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${task.lead_id}`)
  revalidatePath('/agenda')
}
