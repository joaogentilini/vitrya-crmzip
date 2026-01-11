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
