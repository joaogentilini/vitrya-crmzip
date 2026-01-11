'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer' // ajuste apenas se seu helper tiver outro nome

type FinalStatus = 'won' | 'lost'

export async function setLeadFinalStatusAction(input: {
  leadId: string
  status: FinalStatus
}) {
  const { leadId, status } = input

  if (!leadId) throw new Error('leadId é obrigatório')
  if (status !== 'won' && status !== 'lost') {
    throw new Error('status inválido')
  }

  const supabase = await createClient()

  // 1) Buscar lead atual
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, pipeline_id, stage_id, status')
    .eq('id', leadId)
    .single()

  if (leadErr) throw new Error(`Erro ao buscar lead: ${leadErr.message}`)
  if (!lead) throw new Error('Lead não encontrado')

  if (lead.status !== 'open') {
    throw new Error('Este lead já está finalizado.')
  }

  // 2) Buscar último stage do pipeline
  const { data: lastStage, error: stageErr } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id, position')
    .eq('pipeline_id', lead.pipeline_id)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  if (stageErr) {
    throw new Error(`Erro ao buscar último stage: ${stageErr.message}`)
  }
  if (!lastStage) {
    throw new Error('Último stage não encontrado')
  }

  // 3) Atualizar lead
  const { error: updErr } = await supabase
    .from('leads')
    .update({
      status,
      stage_id: lastStage.id,
    })
    .eq('id', leadId)

  if (updErr) {
    throw new Error(`Erro ao atualizar lead: ${updErr.message}`)
  }

  // 4) Registrar histórico
  const { error: logErr } = await supabase
    .from('lead_stage_changes')
    .insert({
      lead_id: leadId,
      pipeline_id: lead.pipeline_id,
      from_stage_id: lead.stage_id,
      to_stage_id: lastStage.id,
    })

  if (logErr) {
    throw new Error(`Erro ao registrar histórico: ${logErr.message}`)
  }

  // 5) Revalidar telas
  revalidatePath('/leads')
  revalidatePath('/kanban')

  return { ok: true }
}
