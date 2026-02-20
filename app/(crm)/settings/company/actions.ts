'use server'

import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import { type CompanySettingsRow } from '@/lib/companySettings'

export type CompanySettingsInput = {
  legal_name: string
  trade_name: string
  cnpj: string
  state_registration: string
  municipal_registration: string
  creci_company: string
  email: string
  phone: string
  address_street: string
  address_number: string
  address_complement: string
  address_neighborhood: string
  address_city: string
  address_state: string
  address_zip: string
  website: string
  default_forum_city: string
  default_forum_state: string
}

function toTrimmed(value: unknown): string {
  return String(value ?? '').trim()
}

function toNull(value: unknown): string | null {
  const text = toTrimmed(value)
  return text || null
}

function toDigits(value: unknown): string {
  return toTrimmed(value).replace(/\D/g, '')
}

export async function upsertCompanySettingsAction(
  input: CompanySettingsInput
): Promise<{ ok: boolean; error?: string; data?: CompanySettingsRow }> {
  await requireRole(['admin', 'gestor'])

  const legalName = toTrimmed(input.legal_name)
  const cnpj = toTrimmed(input.cnpj)
  const cnpjDigits = toDigits(cnpj)
  const defaultForumCity = toTrimmed(input.default_forum_city)
  const defaultForumState = toTrimmed(input.default_forum_state).toUpperCase()

  if (!legalName) {
    return { ok: false, error: 'Razão social é obrigatória.' }
  }

  if (!cnpj) {
    return { ok: false, error: 'CNPJ é obrigatório.' }
  }

  if (cnpjDigits.length !== 14) {
    return { ok: false, error: 'CNPJ inválido. Informe 14 dígitos.' }
  }

  if (!defaultForumCity) {
    return { ok: false, error: 'Cidade padrão do foro é obrigatória.' }
  }

  if (!defaultForumState) {
    return { ok: false, error: 'UF padrão do foro é obrigatória.' }
  }

  const payload = {
    legal_name: legalName,
    trade_name: toNull(input.trade_name),
    cnpj,
    state_registration: toNull(input.state_registration),
    municipal_registration: toNull(input.municipal_registration),
    creci_company: toNull(input.creci_company),
    email: toNull(input.email),
    phone: toNull(input.phone),
    address_street: toNull(input.address_street),
    address_number: toNull(input.address_number),
    address_complement: toNull(input.address_complement),
    address_neighborhood: toNull(input.address_neighborhood),
    address_city: toNull(input.address_city),
    address_state: toNull(input.address_state?.toUpperCase()),
    address_zip: toNull(input.address_zip),
    website: toNull(input.website),
    default_forum_city: defaultForumCity,
    default_forum_state: defaultForumState,
  }

  const supabase = await createClient()
  const { data: existing, error: existingError } = await supabase
    .from('company_settings')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return { ok: false, error: existingError.message || 'Erro ao carregar cadastro atual da empresa.' }
  }

  const writeQuery = existing?.id
    ? supabase.from('company_settings').update(payload).eq('id', existing.id).select('*').single()
    : supabase.from('company_settings').insert(payload).select('*').single()

  const { data, error } = await writeQuery
  if (error || !data) {
    return { ok: false, error: error?.message || 'Erro ao salvar cadastro da empresa.' }
  }

  revalidatePath('/settings/company')

  return {
    ok: true,
    data: data as CompanySettingsRow,
  }
}
