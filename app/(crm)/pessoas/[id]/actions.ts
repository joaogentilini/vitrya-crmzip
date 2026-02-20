'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'
import { requireActiveUser, requireRole } from '@/lib/auth'
import { normalizePersonKindTags } from '@/lib/people2'

const nowIso = () => new Date().toISOString()

const normalizeTextOrNull = (value: unknown) => {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length ? str : null
}

const normalizeBool = (value: unknown) => value === true

const safeDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '')

const isOptionalRelationMissing = (error: { code?: string | null; message?: string | null } | null | undefined) => {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

export async function createPersonNote(personId: string, title: string, notes: string) {
  await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')
  if (!title.trim() && !notes.trim()) throw new Error('Informe um título ou descrição.')

  const supabase = await createClient()

  const payload = {
    person_id: personId,
    type: 'note',
    title: normalizeTextOrNull(title),
    notes: normalizeTextOrNull(notes),
    occurred_at: nowIso()
  }

  const { error } = await supabase.from('person_timeline_events').insert(payload)

  if (error) throw new Error(error.message || 'Erro ao criar evento.')

  revalidatePath(`/pessoas/${personId}`)
}

export async function updatePersonOwner(personId: string, ownerProfileId: string | null) {
  const profile = await requireActiveUser()

  if (profile.role !== 'admin' && profile.role !== 'gestor') {
    throw new Error('Você não tem permissão para alterar o responsável.')
  }

  if (!personId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  const { error } = await supabase
    .from('people')
    .update({ owner_profile_id: ownerProfileId, updated_at: nowIso() })
    .eq('id', personId)

  if (error) throw new Error(error.message || 'Erro ao atualizar responsável.')

  revalidatePath(`/pessoas/${personId}`)
}

export interface UpdatePersonBasicsPayload {
  full_name?: string | null
  email?: string | null
  phone_e164?: string | null
  document_id?: string | null
  notes?: string | null
  assigned_to?: string | null
  owner_profile_id?: string | null | undefined
}

/**
 * Atualiza dados básicos da tabela people.
 * - owner_profile_id só pode ser alterado por admin/gestor (se vier undefined, não altera).
 */
export async function updatePersonBasics(personId: string, payload: UpdatePersonBasicsPayload) {
  const profile = await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')

  const hasOwnerProfileId = payload.owner_profile_id !== undefined
  const hasAssignedTo = payload.assigned_to !== undefined

  const ownerFromOwnerProfileId = hasOwnerProfileId ? normalizeTextOrNull(payload.owner_profile_id) : undefined
  const ownerFromAssignedTo = hasAssignedTo ? normalizeTextOrNull(payload.assigned_to) : undefined

  if (
    hasOwnerProfileId &&
    hasAssignedTo &&
    ownerFromOwnerProfileId !== ownerFromAssignedTo
  ) {
    throw new Error('Valores conflitantes para responsável.')
  }

  const nextOwnerProfileId =
    ownerFromOwnerProfileId !== undefined
      ? ownerFromOwnerProfileId
      : ownerFromAssignedTo !== undefined
        ? ownerFromAssignedTo
        : undefined

  const supabase = await createClient()

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id, owner_profile_id')
    .eq('id', personId)
    .maybeSingle()

  if (personError || !person) throw new Error('Pessoa inválida.')

  const currentOwnerProfileId = normalizeTextOrNull(person.owner_profile_id)
  const ownerChanged = nextOwnerProfileId !== undefined && nextOwnerProfileId !== currentOwnerProfileId

  if (ownerChanged && profile.role !== 'admin' && profile.role !== 'gestor') {
    throw new Error('Você não tem permissão para alterar o responsável.')
  }

  const updateData: Record<string, unknown> = {
    updated_at: nowIso()
  }

  if (payload.full_name !== undefined) updateData.full_name = payload.full_name
  if (payload.email !== undefined) updateData.email = payload.email
  if (payload.phone_e164 !== undefined) updateData.phone_e164 = payload.phone_e164
  if (payload.document_id !== undefined) updateData.document_id = payload.document_id
  if (payload.notes !== undefined) updateData.notes = payload.notes

  // importante: undefined = não altera; null/string = altera
  if (nextOwnerProfileId !== undefined && ownerChanged) {
    updateData.owner_profile_id = nextOwnerProfileId
  }

  const { error } = await supabase.from('people').update(updateData).eq('id', personId)

  if (error) throw new Error(error.message || 'Erro ao atualizar pessoa.')

  revalidatePath(`/pessoas/${personId}`)
}
/**
 * Atualiza o "perfil/tipo" da pessoa (kind_tags) no people.
 * (Útil pra editar Roles dentro do card de dados básicos.)
 */
export async function updatePersonRoles(personId: string, kindTags: string[]) {
  await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  const normalized = normalizePersonKindTags(kindTags)

  const { error } = await supabase
    .from('people')
    .update({ kind_tags: normalized, updated_at: nowIso() })
    .eq('id', personId)

  if (error) throw new Error(error.message || 'Erro ao atualizar roles.')

  revalidatePath(`/pessoas/${personId}`)
}

export async function deletePersonAction(
  personId: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(['admin'])

  if (!personId) {
    return { success: false, error: 'Pessoa invalida.' }
  }

  const supabase = await createClient()

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id')
    .eq('id', personId)
    .maybeSingle()

  if (personError) {
    return { success: false, error: personError.message || 'Erro ao validar pessoa.' }
  }

  if (!person?.id) {
    return { success: false, error: 'Pessoa nao encontrada.' }
  }

  const cleanupOperations: Array<() => Promise<{ error: { code?: string | null; message?: string | null } | null }>> = [
    async () => await supabase.from('properties').update({ owner_client_id: null }).eq('owner_client_id', personId),
    async () => await supabase.from('property_negotiations').update({ person_id: null }).eq('person_id', personId),
    async () => await supabase.from('leads').update({ person_id: null }).eq('person_id', personId),
    async () => await supabase.from('document_instances').update({ owner_person_id: null }).eq('owner_person_id', personId),
    async () => await supabase.from('document_instances').update({ primary_person_id: null }).eq('primary_person_id', personId),
    async () => await supabase.from('person_household_members').delete().eq('primary_person_id', personId),
    async () => await supabase.from('person_household_members').delete().eq('member_person_id', personId),
    async () => await supabase.from('person_bank_accounts').delete().eq('person_id', personId),
    async () => await supabase.from('person_liabilities').delete().eq('person_id', personId),
    async () => await supabase.from('person_income_sources').delete().eq('person_id', personId),
    async () => await supabase.from('person_addresses').delete().eq('person_id', personId),
    async () => await supabase.from('person_company_profiles').delete().eq('person_id', personId),
    async () => await supabase.from('person_financing_profiles').delete().eq('person_id', personId),
    async () => await supabase.from('person_documents').delete().eq('person_id', personId),
    async () => await supabase.from('person_timeline_events').delete().eq('person_id', personId),
    async () => await supabase.from('person_links').delete().eq('person_id', personId),
  ]

  for (const operation of cleanupOperations) {
    const { error: cleanupError } = await operation()
    if (!cleanupError || isOptionalRelationMissing(cleanupError)) continue
    return {
      success: false,
      error: cleanupError.message || 'Erro ao limpar vinculos da pessoa antes da exclusao.',
    }
  }

  const { error: deleteError } = await supabase.from('people').delete().eq('id', personId)
  if (deleteError) {
    return {
      success: false,
      error:
        deleteError.message ||
        'Nao foi possivel excluir a pessoa. Verifique se ainda existem vinculos obrigatorios.',
    }
  }

  revalidatePath('/pessoas')
  revalidatePath('/people')
  return { success: true }
}

export type FinancingUpsertPayload = {
  cpf?: string | null
  rg?: string | null
  rg_issuing_org?: string | null
  birth_date?: string | null
  marital_status?: string | null
  property_regime?: string | null
  nationality?: string | null
  profession?: string | null
  education_level?: string | null
  mother_name?: string | null
}

export async function upsertFinancingProfile(personId: string, payload: FinancingUpsertPayload) {
  await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  // normaliza cpf/rg como dígitos (opcional, mas ajuda a manter padrão)
  const cpf = payload.cpf ? safeDigits(payload.cpf) : null
  const rg = payload.rg ? safeDigits(payload.rg) : null

  const row = {
    person_id: personId,
    cpf: cpf || null,
    rg: rg || null,
    rg_issuing_org: normalizeTextOrNull(payload.rg_issuing_org),
    birth_date: normalizeTextOrNull(payload.birth_date),
    marital_status: normalizeTextOrNull(payload.marital_status),
    property_regime: normalizeTextOrNull(payload.property_regime),
    nationality: normalizeTextOrNull(payload.nationality),
    profession: normalizeTextOrNull(payload.profession),
    education_level: normalizeTextOrNull(payload.education_level),
    mother_name: normalizeTextOrNull(payload.mother_name),
    updated_at: nowIso()
  }

  const { error } = await supabase
    .from('person_financing_profiles')
    .upsert(row, { onConflict: 'person_id' })

  if (error) throw new Error(error.message || 'Erro ao salvar financiamento.')

  revalidatePath(`/pessoas/${personId}`)
}

export type CompanyUpsertPayload = {
  cnpj?: string | null
  legal_name?: string | null
  trade_name?: string | null
  state_registration?: string | null
  municipal_registration?: string | null
}

export async function upsertCompanyProfile(personId: string, payload: CompanyUpsertPayload) {
  await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  const cnpj = payload.cnpj ? safeDigits(payload.cnpj) : null

  const row = {
    person_id: personId,
    cnpj: cnpj || null,
    legal_name: normalizeTextOrNull(payload.legal_name),
    trade_name: normalizeTextOrNull(payload.trade_name),
    state_registration: normalizeTextOrNull(payload.state_registration),
    municipal_registration: normalizeTextOrNull(payload.municipal_registration),
    updated_at: nowIso()
  }

  const { error } = await supabase
    .from('person_company_profiles')
    .upsert(row, { onConflict: 'person_id' })

  if (error) throw new Error(error.message || 'Erro ao salvar empresa.')

  revalidatePath(`/pessoas/${personId}`)
}

export type CurrentAddressPayload = {
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  residence_since?: string | null
  residence_months?: string | null
}

export async function upsertCurrentAddress(personId: string, payload: CurrentAddressPayload) {
  await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  const { data: existing, error: findError } = await supabase
    .from('person_addresses')
    .select('id')
    .eq('person_id', personId)
    .eq('kind', 'current')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) throw new Error(findError.message || 'Erro ao buscar endereço atual.')

  const normalizedRow = {
    street: normalizeTextOrNull(payload.street),
    number: normalizeTextOrNull(payload.number),
    complement: normalizeTextOrNull(payload.complement),
    neighborhood: normalizeTextOrNull(payload.neighborhood),
    city: normalizeTextOrNull(payload.city),
    state: normalizeTextOrNull(payload.state),
    postal_code: normalizeTextOrNull(payload.postal_code),
    residence_since: normalizeTextOrNull(payload.residence_since),
    residence_months: normalizeTextOrNull(payload.residence_months),
    updated_at: nowIso()
  }

  if (existing?.id) {
    const { error } = await supabase.from('person_addresses').update(normalizedRow).eq('id', existing.id)
    if (error) throw new Error(error.message || 'Erro ao atualizar endereço.')
  } else {
    const { error } = await supabase
      .from('person_addresses')
      .insert({ person_id: personId, kind: 'current', ...normalizedRow })
    if (error) throw new Error(error.message || 'Erro ao salvar endereço.')
  }

  revalidatePath(`/pessoas/${personId}`)
}

export type IncomeSourceInsertPayload = {
  income_type?: string | null
  employer_name?: string | null
  employer_cnpj?: string | null
  gross_monthly_income?: string | number | null
  other_monthly_income?: string | number | null
  notes?: string | null
}

export async function addIncomeSource(personId: string, payload: IncomeSourceInsertPayload) {
  await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  const row = {
    person_id: personId,
    income_type: normalizeTextOrNull(payload.income_type),
    employer_name: normalizeTextOrNull(payload.employer_name),
    employer_cnpj: payload.employer_cnpj ? safeDigits(payload.employer_cnpj) : null,
    gross_monthly_income: normalizeTextOrNull(payload.gross_monthly_income),
    other_monthly_income: normalizeTextOrNull(payload.other_monthly_income),
    notes: normalizeTextOrNull(payload.notes)
  }

  const { error } = await supabase.from('person_income_sources').insert(row)

  if (error) throw new Error(error.message || 'Erro ao adicionar renda.')

  revalidatePath(`/pessoas/${personId}`)
}

export async function deleteIncomeSource(id: string) {
  await requireActiveUser()

  if (!id) throw new Error('Renda inválida.')

  const supabase = await createClient()

  const { data: source, error: fetchError } = await supabase
    .from('person_income_sources')
    .select('id, person_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !source) throw new Error(fetchError?.message || 'Renda não encontrada.')

  const { error } = await supabase.from('person_income_sources').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Erro ao remover renda.')

  revalidatePath(`/pessoas/${source.person_id}`)
}

export type LiabilityInsertPayload = {
  kind?: string | null
  monthly_amount?: string | number | null
  creditor?: string | null
  notes?: string | null
}

export async function addLiability(personId: string, payload: LiabilityInsertPayload) {
  await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  const row = {
    person_id: personId,
    kind: normalizeTextOrNull(payload.kind),
    monthly_amount: normalizeTextOrNull(payload.monthly_amount),
    creditor: normalizeTextOrNull(payload.creditor),
    notes: normalizeTextOrNull(payload.notes)
  }

  const { error } = await supabase.from('person_liabilities').insert(row)

  if (error) throw new Error(error.message || 'Erro ao adicionar comprometimento.')

  revalidatePath(`/pessoas/${personId}`)
}

export async function deleteLiability(id: string) {
  await requireActiveUser()

  if (!id) throw new Error('Comprometimento inválido.')

  const supabase = await createClient()

  const { data: item, error: fetchError } = await supabase
    .from('person_liabilities')
    .select('id, person_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !item) throw new Error(fetchError?.message || 'Comprometimento não encontrado.')

  const { error } = await supabase.from('person_liabilities').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Erro ao remover comprometimento.')

  revalidatePath(`/pessoas/${item.person_id}`)
}

export type BankAccountInsertPayload = {
  bank_name?: string | null
  agency?: string | null
  account_number?: string | null
  account_type?: string | null
  is_preferred?: boolean
}

export async function addBankAccount(personId: string, payload: BankAccountInsertPayload) {
  await requireActiveUser()

  if (!personId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  const row = {
    person_id: personId,
    bank_name: normalizeTextOrNull(payload.bank_name),
    agency: normalizeTextOrNull(payload.agency),
    account_number: normalizeTextOrNull(payload.account_number),
    account_type: normalizeTextOrNull(payload.account_type),
    is_preferred: normalizeBool(payload.is_preferred)
  }

  const { data, error } = await supabase
    .from('person_bank_accounts')
    .insert(row)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message || 'Erro ao adicionar conta.')

  if (row.is_preferred && data?.id) {
    await setPreferredBankAccount(data.id)
  }

  revalidatePath(`/pessoas/${personId}`)
}

export async function setPreferredBankAccount(id: string) {
  await requireActiveUser()

  if (!id) throw new Error('Conta inválida.')

  const supabase = await createClient()

  const { data: account, error: fetchError } = await supabase
    .from('person_bank_accounts')
    .select('id, person_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !account) throw new Error(fetchError?.message || 'Conta não encontrada.')

  const { error: resetError } = await supabase
    .from('person_bank_accounts')
    .update({ is_preferred: false })
    .eq('person_id', account.person_id)

  if (resetError) throw new Error(resetError.message || 'Erro ao atualizar contas.')

  const { error } = await supabase.from('person_bank_accounts').update({ is_preferred: true }).eq('id', id)

  if (error) throw new Error(error.message || 'Erro ao definir conta preferida.')

  revalidatePath(`/pessoas/${account.person_id}`)
}

export async function addHouseholdMember(
  primaryPersonId: string,
  memberPersonId: string,
  relationship: string | null
) {
  await requireActiveUser()

  if (!primaryPersonId || !memberPersonId) throw new Error('Pessoa inválida.')

  const supabase = await createClient()

  const { error } = await supabase.from('person_household_members').insert({
    primary_person_id: primaryPersonId,
    member_person_id: memberPersonId,
    relationship: normalizeTextOrNull(relationship)
  })

  if (error) throw new Error(error.message || 'Erro ao adicionar membro.')

  revalidatePath(`/pessoas/${primaryPersonId}`)
}

export async function removeHouseholdMember(id: string) {
  await requireActiveUser()

  if (!id) throw new Error('Membro inválido.')

  const supabase = await createClient()

  const { data: row, error: fetchError } = await supabase
    .from('person_household_members')
    .select('id, primary_person_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !row) throw new Error(fetchError?.message || 'Membro não encontrado.')

  const { error } = await supabase.from('person_household_members').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Erro ao remover membro.')

  revalidatePath(`/pessoas/${row.primary_person_id}`)
}

export async function searchPeople(query: string) {
  await requireActiveUser()

  const term = query.trim()
  if (!term) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('people')
    .select('id, full_name, email, phone_e164')
    .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone_e164.ilike.%${term}%`)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw new Error(error.message || 'Erro ao buscar pessoas.')

  return data ?? []
}
