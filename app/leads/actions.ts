'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'
import { normalizeBrazilianPhone } from '@/lib/phone'

type CreateLeadInput = {
  title: string
  pipelineId?: string
  stageId?: string
  clientName?: string
  phoneRaw?: string
  leadTypeId?: string
  leadInterestId?: string
  leadSourceId?: string
  budgetRange?: string
  notes?: string
}

type UpdateLeadInput = {
  leadId: string
  title?: string
  pipelineId?: string | null
  stageId?: string | null
  clientName?: string
  phoneRaw?: string
  leadTypeId?: string | null
  leadInterestId?: string | null
  leadSourceId?: string | null
  budgetRange?: string | null
  notes?: string | null
}

export interface DuplicateCheckResult {
  exists: boolean
  lead?: {
    id: string
    client_name: string | null
    title: string
    stage_id: string | null
    updated_at: string | null
  }
}

export type ActionResult<T = unknown> = 
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown }

type LeadRow = {
  id: string
  title: string
  status: string
  pipeline_id: string | null
  stage_id: string | null
  owner_user_id: string | null
  created_at: string
  [key: string]: unknown
}

export async function checkLeadByPhoneAction(phoneRaw: string): Promise<DuplicateCheckResult> {
  const supabase = await createClient()

  const normalized = normalizeBrazilianPhone(phoneRaw)
  if (!normalized.isValid || !normalized.e164) {
    return { exists: false }
  }

  const { data: existingLead } = await supabase
    .from('leads')
    .select('id, client_name, title, stage_id, updated_at')
    .eq('phone_e164', normalized.e164)
    .limit(1)
    .maybeSingle()

  if (existingLead) {
    return { exists: true, lead: existingLead }
  }

  return { exists: false }
}

export async function createLeadAction(data: CreateLeadInput): Promise<ActionResult<LeadRow>> {
  const supabase = await createClient()

  // 1. Validate auth
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    console.error('[createLeadAction] authError:', authError)
    return {
      ok: false,
      code: 'AUTH_ERROR',
      message: 'Usuário não autenticado',
      details: authError
    }
  }
  const actorId = userRes.user.id

  // 2. Validate title
  if (!data.title || data.title.trim().length < 2) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Título é obrigatório (mínimo 2 caracteres)'
    }
  }

  // 3. Resolve pipeline
  let pipelineId = data.pipelineId
  if (!pipelineId) {
    const { data: defaultPipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (pipelineError) {
      console.error('[createLeadAction] pipelineError:', pipelineError)
      return {
        ok: false,
        code: 'PIPELINE_ERROR',
        message: 'Erro ao buscar pipeline padrão',
        details: pipelineError
      }
    }

    if (!defaultPipeline) {
      return {
        ok: false,
        code: 'NO_PIPELINE',
        message: 'Nenhum pipeline encontrado. Crie um pipeline primeiro.'
      }
    }

    pipelineId = defaultPipeline.id
  }

  // 4. Resolve stage
  let stageId = data.stageId
  if (!stageId) {
    const { data: firstStage, error: stageError } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (stageError) {
      console.error('[createLeadAction] stageError:', stageError)
      return {
        ok: false,
        code: 'STAGE_ERROR',
        message: 'Erro ao buscar estágio inicial',
        details: stageError
      }
    }

    if (!firstStage) {
      return {
        ok: false,
        code: 'NO_STAGE',
        message: 'Nenhum estágio encontrado para este pipeline. Configure os estágios primeiro.'
      }
    }

    stageId = firstStage.id
  }

  // 5. Normalize phone if provided
  let phoneE164: string | null = null
  if (data.phoneRaw && data.phoneRaw.trim()) {
    const normalized = normalizeBrazilianPhone(data.phoneRaw)
    if (!normalized.isValid) {
      return {
        ok: false,
        code: 'PHONE_INVALID',
        message: normalized.error || 'Telefone inválido'
      }
    }
    phoneE164 = normalized.e164

    // Check for duplicates
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, client_name')
      .eq('phone_e164', phoneE164)
      .limit(1)
      .maybeSingle()

    if (existingLead) {
      return {
        ok: false,
        code: 'PHONE_DUPLICATE',
        message: `Já existe um lead com esse telefone: ${existingLead.client_name || 'Lead existente'}`,
        details: { existingLeadId: existingLead.id }
      }
    }
  }

  // 6. Build payload
  const payload = {
    title: data.title.trim(),
    status: 'open',
    pipeline_id: pipelineId,
    stage_id: stageId,
    user_id: actorId,
    created_by: actorId,
    assigned_to: actorId,
    owner_user_id: actorId,
    client_name: data.clientName?.trim() || data.title.trim(),
    phone_raw: data.phoneRaw?.trim() || null,
    phone_e164: phoneE164,
    lead_type_id: data.leadTypeId || null,
    lead_interest_id: data.leadInterestId || null,
    lead_source_id: data.leadSourceId || null,
    budget_range: data.budgetRange?.trim() || null,
    notes: data.notes?.trim() || null,
  }

  // 7. Insert lead
  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert(payload)
    .select('*')
    .single()

  if (insertError) {
    console.error('[createLeadAction] insertError:', insertError)
    
    if (insertError.code === '23505' && insertError.message.includes('phone_e164')) {
      return {
        ok: false,
        code: 'PHONE_DUPLICATE',
        message: 'Já existe um lead cadastrado com esse telefone.'
      }
    }
    
    if (insertError.code === '42501') {
      return {
        ok: false,
        code: 'RLS_ERROR',
        message: 'Sem permissão para criar leads. Verifique suas permissões.',
        details: insertError
      }
    }

    return {
      ok: false,
      code: 'INSERT_ERROR',
      message: insertError.message,
      details: insertError
    }
  }

  // 8. Audit log (non-blocking)
  supabase.from('lead_audit_logs').insert({
    lead_id: inserted.id,
    actor_id: actorId,
    action: 'create',
    before: null,
    after: inserted,
  }).then(({ error: auditError }) => {
    if (auditError) {
      console.error('[createLeadAction] auditError:', auditError)
    }
  })

  // 9. Revalidate paths
  revalidatePath('/leads')
  revalidatePath('/leads/kanban')

  return { ok: true, data: inserted as LeadRow }
}

export async function updateLeadAction(data: UpdateLeadInput): Promise<ActionResult<{ success: boolean }>> {
  const supabase = await createClient()
  
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return {
      ok: false,
      code: 'AUTH_ERROR',
      message: 'Usuário não autenticado'
    }
  }
  const actorId = userRes.user.id

  // Get current lead for audit
  const { data: currentLead, error: fetchError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', data.leadId)
    .maybeSingle()

  if (fetchError || !currentLead) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Lead não encontrado',
      details: fetchError
    }
  }

  const updateData: Record<string, unknown> = {}

  if (data.title !== undefined) updateData.title = data.title
  if (data.pipelineId !== undefined) updateData.pipeline_id = data.pipelineId
  if (data.stageId !== undefined) updateData.stage_id = data.stageId
  if (data.clientName !== undefined) updateData.client_name = data.clientName
  if (data.leadTypeId !== undefined) updateData.lead_type_id = data.leadTypeId
  if (data.leadInterestId !== undefined) updateData.lead_interest_id = data.leadInterestId
  if (data.leadSourceId !== undefined) updateData.lead_source_id = data.leadSourceId
  if (data.budgetRange !== undefined) updateData.budget_range = data.budgetRange
  if (data.notes !== undefined) updateData.notes = data.notes

  // Handle phone update
  if (data.phoneRaw !== undefined) {
    if (data.phoneRaw && data.phoneRaw.trim()) {
      const normalized = normalizeBrazilianPhone(data.phoneRaw)
      if (!normalized.isValid) {
        return {
          ok: false,
          code: 'PHONE_INVALID',
          message: normalized.error || 'Telefone inválido'
        }
      }
      
      // Check for duplicates (excluding current lead)
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, client_name')
        .eq('phone_e164', normalized.e164)
        .neq('id', data.leadId)
        .limit(1)
        .maybeSingle()

      if (existingLead) {
        return {
          ok: false,
          code: 'PHONE_DUPLICATE',
          message: `Já existe outro lead com esse telefone: ${existingLead.client_name || 'Lead existente'}`,
          details: { existingLeadId: existingLead.id }
        }
      }

      updateData.phone_raw = data.phoneRaw
      updateData.phone_e164 = normalized.e164
    } else {
      updateData.phone_raw = null
      updateData.phone_e164 = null
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { ok: true, data: { success: true } }
  }

  const { data: updated, error: updateError } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', data.leadId)
    .select('*')
    .single()

  if (updateError) {
    console.error('[updateLeadAction] updateError:', updateError)
    if (updateError.code === '23505' && updateError.message.includes('phone_e164')) {
      return {
        ok: false,
        code: 'PHONE_DUPLICATE',
        message: 'Já existe um lead cadastrado com esse telefone.'
      }
    }
    return {
      ok: false,
      code: 'UPDATE_ERROR',
      message: updateError.message,
      details: updateError
    }
  }

  // Audit log (non-blocking)
  supabase.from('lead_audit_logs').insert({
    lead_id: data.leadId,
    actor_id: actorId,
    action: 'update',
    before: currentLead,
    after: updated,
  }).then(({ error: auditError }) => {
    if (auditError) {
      console.error('[updateLeadAction] auditError:', auditError)
    }
  })

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${data.leadId}`)
  
  return { ok: true, data: { success: true } }
}

export async function updateLeadOwnerAction(leadId: string, newOwnerId: string): Promise<ActionResult<{ success: boolean }>> {
  const supabase = await createClient()
  
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return {
      ok: false,
      code: 'AUTH_ERROR',
      message: 'Usuário não autenticado'
    }
  }
  const actorId = userRes.user.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', actorId)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'gestor') {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Apenas admin/gestor pode reatribuir leads'
    }
  }

  const { data: currentLead } = await supabase
    .from('leads')
    .select('id, owner_user_id')
    .eq('id', leadId)
    .maybeSingle()

  if (!currentLead) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Lead não encontrado'
    }
  }

  const { error: updateError } = await supabase
    .from('leads')
    .update({ owner_user_id: newOwnerId })
    .eq('id', leadId)

  if (updateError) {
    console.error('[updateLeadOwnerAction] updateError:', updateError)
    return {
      ok: false,
      code: 'UPDATE_ERROR',
      message: 'Erro ao atualizar responsável',
      details: updateError
    }
  }

  // Audit log (non-blocking)
  supabase.from('lead_audit_logs').insert({
    lead_id: leadId,
    actor_id: actorId,
    action: 'owner_changed',
    before: { owner_user_id: currentLead.owner_user_id },
    after: { owner_user_id: newOwnerId },
  }).then(({ error }) => {
    if (error) console.error('[updateLeadOwnerAction] auditError:', error)
  })

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${leadId}`)
  
  return { ok: true, data: { success: true } }
}
