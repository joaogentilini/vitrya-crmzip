'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'


type MoveLeadInput = {
  leadId: string
  pipelineId: string
  fromStageId: string
  toStageId: string
}

export async function moveLeadToStageAction(data: MoveLeadInput) {
  const { leadId, pipelineId, fromStageId, toStageId } = data

  if (fromStageId === toStageId) {
    return
  }

  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')

  const actorId = userRes.user.id

  const { error } = await supabase
    .from('leads')
    .update({
      pipeline_id: pipelineId,
      stage_id: toStageId,
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  try {
    await supabase.from('lead_audit_logs').insert({
      lead_id: leadId,
      actor_id: actorId,
      action: 'move_stage',
      before: { stage_id: fromStageId },
      after: { stage_id: toStageId },
    })
  } catch (auditErr) {
    console.error('[moveLeadToStageAction] Audit log insert failed:', auditErr)
  }

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${leadId}`)
}
