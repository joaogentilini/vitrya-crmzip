'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'
import { normalizeBrazilianPhone } from '@/lib/phone'

type CreateLeadInput = {
  title: string
  pipelineId: string
  stageId: string
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

async function getAuthedUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Usuário não autenticado')
  return userRes.user.id
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
    .single()

  if (existingLead) {
    return { exists: true, lead: existingLead }
  }

  return { exists: false }
}

export async function createLeadAction(data: CreateLeadInput) {
  const supabase = await createClient()
  const actorId = await getAuthedUserId(supabase)

  // Normalize phone if provided
  let phoneE164: string | null = null
  if (data.phoneRaw) {
    const normalized = normalizeBrazilianPhone(data.phoneRaw)
    if (!normalized.isValid) {
      throw new Error(normalized.error || 'Telefone inválido')
    }
    phoneE164 = normalized.e164

    // Check for duplicates
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, client_name')
      .eq('phone_e164', phoneE164)
      .limit(1)
      .single()

    if (existingLead) {
      throw new Error(`Já existe um lead com esse telefone: ${existingLead.client_name || 'Lead existente'}. ID: ${existingLead.id}`)
    }
  }

  const payload: Record<string, unknown> = {
    title: data.title,
    status: 'open',
    pipeline_id: data.pipelineId,
    stage_id: data.stageId,
    user_id: actorId,
    created_by: actorId,
    assigned_to: actorId,
    owner_user_id: actorId,
    client_name: data.clientName || data.title,
    phone_raw: data.phoneRaw || null,
    phone_e164: phoneE164,
    lead_type_id: data.leadTypeId || null,
    lead_interest_id: data.leadInterestId || null,
    lead_source_id: data.leadSourceId || null,
    budget_range: data.budgetRange || null,
    notes: data.notes || null,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert(payload)
    .select('*')
    .single()

  if (insertError) {
    console.error('[createLeadAction] insertError:', insertError)
    if (insertError.code === '23505' && insertError.message.includes('phone_e164')) {
      throw new Error('Já existe um lead cadastrado com esse telefone.')
    }
    throw new Error(insertError.message)
  }

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
  revalidatePath('/leads/kanban')
  return inserted
}

export async function updateLeadAction(data: UpdateLeadInput) {
  const supabase = await createClient()
  const actorId = await getAuthedUserId(supabase)

  // Get current lead for audit
  const { data: currentLead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', data.leadId)
    .single()

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
    if (data.phoneRaw) {
      const normalized = normalizeBrazilianPhone(data.phoneRaw)
      if (!normalized.isValid) {
        throw new Error(normalized.error || 'Telefone inválido')
      }
      
      // Check for duplicates (excluding current lead)
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, client_name')
        .eq('phone_e164', normalized.e164)
        .neq('id', data.leadId)
        .limit(1)
        .single()

      if (existingLead) {
        throw new Error(`Já existe outro lead com esse telefone: ${existingLead.client_name || 'Lead existente'}`)
      }

      updateData.phone_raw = data.phoneRaw
      updateData.phone_e164 = normalized.e164
    } else {
      updateData.phone_raw = null
      updateData.phone_e164 = null
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { success: true }
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
      throw new Error('Já existe um lead cadastrado com esse telefone.')
    }
    throw new Error(updateError.message)
  }

  // Audit log
  const { error: auditError } = await supabase.from('lead_audit_logs').insert({
    lead_id: data.leadId,
    actor_id: actorId,
    action: 'update',
    before: currentLead,
    after: updated,
  })

  if (auditError) {
    console.error('[updateLeadAction] auditError:', auditError)
  }

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${data.leadId}`)
  return { success: true }
}
