'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'

type CreateLeadInput = {
  title: string
  pipelineId: string
  stageId: string
}

type UpdateLeadInput = {
  leadId: string
  title: string
  pipelineId: string | null
  stageId: string | null
}

async function getAuthedUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')
  return userRes.user.id
}

export async function createLeadAction(data: CreateLeadInput) {
  const supabase = await createClient()
  const actorId = await getAuthedUserId(supabase)

  const payload = {
    title: data.title,
    status: 'open' as const,
    pipeline_id: data.pipelineId,
    stage_id: data.stageId,
    user_id: actorId,
    created_by: actorId,
    assigned_to: actorId,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert(payload)
    .select('*')
    .single()

  if (insertError) {
    console.error('[createLeadAction] insertError:', insertError)
    throw new Error(insertError.message)
  }

  // rastro do CREATE
  const { error: auditError } = await supabase.from('lead_audit_logs').insert({
    lead_id: inserted.id,
    actor_id: actorId,
    action: 'create',
    before: null,
    after: inserted,
  })

  if (auditError) {
    console.error('[createLeadAction] auditError:', auditError)
  }

  revalidatePath('/leads')
  return inserted
}

export async function updateLeadAction(data: UpdateLeadInput) {
  const supabase = await createClient()
  await getAuthedUserId(supabase)

  const updateData: Record<string, string> = {
    title: data.title,
  }

  if (data.pipelineId !== null) updateData.pipeline_id = data.pipelineId
  if (data.stageId !== null) updateData.stage_id = data.stageId

  // Não filtra por user_id: admin/gestor precisa atualizar qualquer lead.
  // A RLS define permissão (is_admin() ou owner/assigned).
  const { error: updateError } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', data.leadId)

  if (updateError) {
    console.error('[updateLeadAction] updateError:', updateError)
    throw new Error(updateError.message)
  }

  revalidatePath('/leads')
  revalidatePath(`/leads/${data.leadId}`)
  return { success: true }
}
