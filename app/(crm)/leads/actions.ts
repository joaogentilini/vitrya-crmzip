'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'
import { normalizeBrazilianPhone } from '@/lib/phone'

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

type CreateLeadInput = {
  title: string
  pipelineId?: string
  stageId?: string
  clientName?: string
  phoneRaw?: string
  email?: string
  leadTypeId?: string
  leadInterestId?: string
  leadSourceId?: string
  budgetRange?: string
  notes?: string
  ownerUserId?: string
  personId?: string
  personType?: 'PF' | 'PJ'
  cpf?: string
  rg?: string
  rgIssuingOrg?: string
  maritalStatus?: string
  birthDate?: string
  cnpj?: string
  legalName?: string
  tradeName?: string
  stateRegistration?: string
  municipalRegistration?: string
}

type UpdateLeadInput = {
  leadId: string
  title?: string
  pipelineId?: string | null
  stageId?: string | null
  clientName?: string
  phoneRaw?: string
  email?: string | null
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

type PersonRow = {
  id: string
  full_name: string | null
  email: string | null
  phone_e164: string | null
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

  // 6. Validate email if provided
  const emailValue = data.email?.trim() || null
  if (emailValue && !isValidEmail(emailValue)) {
    return {
      ok: false,
      code: 'EMAIL_INVALID',
      message: 'Email inválido'
    }
  }

  // 6.5 Determine owner_user_id (admin/gestor can choose, others default to self)
  let ownerUserId = actorId
  if (data.ownerUserId && data.ownerUserId !== actorId) {
    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', actorId)
      .single()
    
    if (actorProfile?.role === 'admin' || actorProfile?.role === 'gestor') {
      // Validate that the target user exists and is active
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, is_active')
        .eq('id', data.ownerUserId)
        .single()
      
      if (targetProfile && targetProfile.is_active !== false) {
        ownerUserId = data.ownerUserId
      }
    }
  }

  const personType = data.personType === 'PJ' ? 'PJ' : 'PF'
  const cpf = data.cpf?.trim() || null
  const rg = data.rg?.trim() || null
  const rgIssuingOrg = data.rgIssuingOrg?.trim() || null
  const maritalStatus = data.maritalStatus?.trim() || null
  const birthDate = data.birthDate?.trim() || null
  const cnpj = data.cnpj?.trim() || null
  const legalName = data.legalName?.trim() || null
  const tradeName = data.tradeName?.trim() || null
  const stateRegistration = data.stateRegistration?.trim() || null
  const municipalRegistration = data.municipalRegistration?.trim() || null

  const hasProfileData =
    !!cpf ||
    !!rg ||
    !!rgIssuingOrg ||
    !!maritalStatus ||
    !!birthDate ||
    !!cnpj ||
    !!legalName ||
    !!tradeName ||
    !!stateRegistration ||
    !!municipalRegistration

  let personId = data.personId || null

  if (!personId && hasProfileData) {
    if (personType === 'PF' && cpf) {
      const { data: personByCpf } = await supabase
        .from('person_financing_profiles')
        .select('person_id')
        .eq('cpf', cpf)
        .limit(1)
        .maybeSingle()
      if (personByCpf?.person_id) {
        personId = personByCpf.person_id as string
      }
    }

    if (!personId && personType === 'PJ' && cnpj) {
      const { data: personByCnpj } = await supabase
        .from('person_company_profiles')
        .select('person_id')
        .eq('cnpj', cnpj)
        .limit(1)
        .maybeSingle()
      if (personByCnpj?.person_id) {
        personId = personByCnpj.person_id as string
      }
    }

    if (!personId && phoneE164) {
      const { data: personByPhone } = await supabase
        .from('people')
        .select('id')
        .eq('phone_e164', phoneE164)
        .limit(1)
        .maybeSingle()
      if (personByPhone?.id) {
        personId = personByPhone.id as string
      }
    }

    if (!personId && emailValue) {
      const { data: personByEmail } = await supabase
        .from('people')
        .select('id')
        .ilike('email', emailValue)
        .limit(1)
        .maybeSingle()
      if (personByEmail?.id) {
        personId = personByEmail.id as string
      }
    }

    if (!personId) {
      const documentId = personType === 'PJ' ? cnpj : cpf
      const { data: newPerson, error: personError } = await supabase
        .from('people')
        .insert({
          full_name: data.clientName?.trim() || data.title.trim(),
          phone_e164: phoneE164,
          email: emailValue,
          document_id: documentId || null,
          owner_profile_id: ownerUserId,
          created_by_profile_id: actorId
        })
        .select('id')
        .single()

      if (personError || !newPerson) {
        return {
          ok: false,
          code: 'PERSON_CREATE_ERROR',
          message: 'Erro ao criar pessoa',
          details: personError
        }
      }

      personId = newPerson.id as string
    }

  }

  if (personId && hasProfileData) {
    if (personType === 'PF') {
      const { error: financingError } = await supabase
        .from('person_financing_profiles')
        .upsert(
          {
            person_id: personId,
            cpf,
            rg,
            rg_issuing_org: rgIssuingOrg,
            marital_status: maritalStatus,
            birth_date: birthDate
          },
          { onConflict: 'person_id' }
        )
      if (financingError) {
        return {
          ok: false,
          code: 'PERSON_PROFILE_ERROR',
          message: 'Erro ao salvar dados de PF',
          details: financingError
        }
      }
    } else {
      const { error: companyError } = await supabase
        .from('person_company_profiles')
        .upsert(
          {
            person_id: personId,
            cnpj,
            legal_name: legalName,
            trade_name: tradeName,
            state_registration: stateRegistration,
            municipal_registration: municipalRegistration
          },
          { onConflict: 'person_id' }
        )
      if (companyError) {
        return {
          ok: false,
          code: 'PERSON_PROFILE_ERROR',
          message: 'Erro ao salvar dados de PJ',
          details: companyError
        }
      }
    }
  }

  // 7. Build payload
  const payload = {
    title: data.title.trim(),
    status: 'open',
    pipeline_id: pipelineId,
    stage_id: stageId,
    user_id: actorId,
    created_by: actorId,
    assigned_to: ownerUserId,
    owner_user_id: ownerUserId,
    client_name: data.clientName?.trim() || data.title.trim(),
    phone_raw: data.phoneRaw?.trim() || null,
    phone_e164: phoneE164,
    email: emailValue,
    lead_type_id: data.leadTypeId || null,
    lead_interest_id: data.leadInterestId || null,
    lead_source_id: data.leadSourceId || null,
    budget_range: data.budgetRange?.trim() || null,
    notes: data.notes?.trim() || null,
    person_id: personId,
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
  }).then(({ error: auditError }: { error: any }) => {
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

  // Handle email update
  if (data.email !== undefined) {
    if (data.email && data.email.trim()) {
      if (!isValidEmail(data.email.trim())) {
        return {
          ok: false,
          code: 'EMAIL_INVALID',
          message: 'Email inválido'
        }
      }
      updateData.email = data.email.trim()
    } else {
      updateData.email = null
    }
  }

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
  }).then(({ error: auditError }: { error: any }) => {
    if (auditError) {
      console.error('[updateLeadAction] auditError:', auditError)
    }
  })

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${data.leadId}`)
  
  return { ok: true, data: { success: true } }
}

export async function updateLeadOwnerAction(leadId: string, newAssignedTo: string): Promise<ActionResult<{ success: boolean }>> {
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

  const isAdminOrGestor = profile?.role === 'admin' || profile?.role === 'gestor'
  
  // Corretor can only assign to themselves
  if (!isAdminOrGestor && newAssignedTo !== actorId) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Você só pode atribuir leads a si mesmo'
    }
  }

  const { data: currentLead } = await supabase
    .from('leads')
    .select('id, assigned_to, owner_user_id')
    .eq('id', leadId)
    .maybeSingle()

  if (!currentLead) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Lead não encontrado'
    }
  }

  // Update assigned_to (primary), and set owner_user_id only if missing
  const updates: { assigned_to: string; owner_user_id?: string } = { 
    assigned_to: newAssignedTo 
  }
  if (!currentLead.owner_user_id) {
    updates.owner_user_id = newAssignedTo
  }

  const { error: updateError } = await supabase
    .from('leads')
    .update(updates)
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
    action: 'assigned_to_changed',
    before: { assigned_to: currentLead.assigned_to },
    after: { assigned_to: newAssignedTo },
  }).then(({ error }: { error: any }) => {
    if (error) console.error('[updateLeadOwnerAction] auditError:', error)
  })

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath(`/leads/${leadId}`)
  
  return { ok: true, data: { success: true } }
}

export async function linkLeadToPersonAction(
  leadId: string
): Promise<ActionResult<{ personId: string }>> {
  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return {
      ok: false,
      code: 'AUTH_ERROR',
      message: 'Usuário não autenticado',
      details: authError
    }
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, title, client_name, phone_e164, email, person_id')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return {
      ok: false,
      code: 'LEAD_NOT_FOUND',
      message: 'Lead não encontrado',
      details: leadError
    }
  }

  if (lead.person_id) {
    return { ok: true, data: { personId: lead.person_id } }
  }

  let person: PersonRow | null = null

  if (lead.phone_e164) {
    const { data: personByPhone, error: phoneError } = await supabase
      .from('people')
      .select('id, full_name, email, phone_e164')
      .eq('phone_e164', lead.phone_e164)
      .limit(1)
      .maybeSingle()

    if (phoneError) {
      return {
        ok: false,
        code: 'PERSON_LOOKUP_ERROR',
        message: 'Erro ao buscar pessoa por telefone',
        details: phoneError
      }
    }

    person = personByPhone as PersonRow | null
  }

  if (!person && lead.email) {
    const { data: personByEmail, error: emailError } = await supabase
      .from('people')
      .select('id, full_name, email, phone_e164')
      .ilike('email', lead.email)
      .limit(1)
      .maybeSingle()

    if (emailError) {
      return {
        ok: false,
        code: 'PERSON_LOOKUP_ERROR',
        message: 'Erro ao buscar pessoa por email',
        details: emailError
      }
    }

    person = personByEmail as PersonRow | null
  }

  if (!person) {
    const payload: Record<string, unknown> = {
      full_name: lead.client_name || lead.title,
      email: lead.email || null,
      phone_e164: lead.phone_e164 || null,
      owner_profile_id: userRes.user.id,
      created_by_profile_id: userRes.user.id
    }

    const { data: createdPerson, error: createError } = await supabase
      .from('people')
      .insert(payload)
      .select('id, full_name, email, phone_e164')
      .single()

    if (createError || !createdPerson) {
      return {
        ok: false,
        code: 'PERSON_CREATE_ERROR',
        message: 'Erro ao criar pessoa',
        details: createError
      }
    }

    person = createdPerson as PersonRow
  }

  const { error: updateError } = await supabase
    .from('leads')
    .update({ person_id: person.id })
    .eq('id', leadId)

  if (updateError) {
    return {
      ok: false,
      code: 'LEAD_UPDATE_ERROR',
      message: 'Erro ao vincular lead à pessoa',
      details: updateError
    }
  }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath(`/pessoas/${person.id}`)

  return { ok: true, data: { personId: person.id } }
}
