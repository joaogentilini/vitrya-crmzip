'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'


type MoveLeadInput = {
  leadId: string
  pipelineId: string
  toStageId: string
}

export async function moveLeadToStageAction(data: MoveLeadInput) {
 const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')

  const { error } = await supabase
    .from('leads')
    .update({
      pipeline_id: data.pipelineId,
      stage_id: data.toStageId,
    })
    .eq('id', data.leadId)

  if (error) throw new Error(error.message)

  // Revalida as duas rotas que exibem leads
  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
}
