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
