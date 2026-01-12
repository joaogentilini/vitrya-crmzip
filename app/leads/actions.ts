'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'

type CreateLeadInput = {
  title: string
  pipelineId: string
  stageId: string
}

export async function createLeadAction(data: CreateLeadInput) {
  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')
  const userId = userRes.user.id

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert({
      title: data.title,
      status: 'open',
      pipeline_id: data.pipelineId,
      stage_id: data.stageId,
      created_by: userId,
      assigned_to: userId,
    })
    .select()
    .single()

  if (insertError) {
    console.error('[createLeadAction] insertError:', insertError)
    throw new Error(insertError.message)
  }

  revalidatePath('/leads')
  return inserted
}

type UpdateLeadInput = {
  leadId: string
  title: string
  pipelineId: string | null
  stageId: string | null
}

export async function updateLeadAction(data: UpdateLeadInput) {
  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')

  const updateData: Record<string, string | null> = {
    title: data.title,
  }

  if (data.pipelineId !== null) {
    updateData.pipeline_id = data.pipelineId
  }
  if (data.stageId !== null) {
    updateData.stage_id = data.stageId
  }

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
