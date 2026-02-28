import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type CompanySettingsRow = {
  id: string
  legal_name: string
  trade_name: string | null
  cnpj: string
  state_registration: string | null
  municipal_registration: string | null
  creci_company: string | null
  email: string | null
  phone: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  website: string | null
  default_forum_city: string
  default_forum_state: string
  created_at: string
  updated_at: string
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim()
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
  return parts
    .map((item) => cleanText(item))
    .filter(Boolean)
    .join(separator)
}

export function buildCompanyFullAddress(settings: CompanySettingsRow | null): string {
  if (!settings) return ''

  const street = cleanText(settings.address_street)
  const number = cleanText(settings.address_number)
  const complement = cleanText(settings.address_complement)
  const neighborhood = cleanText(settings.address_neighborhood)
  const city = cleanText(settings.address_city)
  const state = cleanText(settings.address_state)
  const zip = cleanText(settings.address_zip)

  const streetBase = joinNonEmpty([street, number], ', ')
  const streetWithComplement = joinNonEmpty([streetBase, complement], ' ')
  const district = neighborhood ? `- ${neighborhood}` : ''
  const cityState = joinNonEmpty([city, state], '/')
  const zipLabel = zip ? `CEP ${zip}` : ''

  return joinNonEmpty(
    [streetWithComplement, district, cityState, zipLabel].filter(Boolean).map((item) => cleanText(item)),
    ', '
  )
}

export function getCompanyDocumentsEmail(
  settings: CompanySettingsRow | null,
  actorEmail?: string | null
): string | null {
  const envEmail = cleanText(process.env.COMPANY_DOCUMENTS_EMAIL)
  const companyEmail = cleanText(settings?.email)
  const actor = cleanText(actorEmail)
  return envEmail || companyEmail || actor || null
}

export async function getCompanySettingsAdmin(): Promise<CompanySettingsRow | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('company_settings')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null
    return data as CompanySettingsRow
  } catch {
    return null
  }
}
