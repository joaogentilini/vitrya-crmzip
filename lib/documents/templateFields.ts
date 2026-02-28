export const MASTER_TEMPLATE_PLACEHOLDERS = [
  'company_trade_name',
  'company_legal_name',
  'company_cnpj',
  'company_creci',
  'company_email',
  'company_phone',
  'company_full_address',
  'company_website',
  'document_number',
  'generated_at_br',
  'verify_url',
  'property_id',
  'property_title',
  'property_registry_number',
  'property_address',
  'property_sale_price_brl',
  'property_rent_price_brl',
  'property_purpose',
  'owner_name',
  'owner_document',
  'owner_email',
  'owner_phone',
  'owner_address',
  'buyer_name',
  'buyer_document',
  'buyer_email',
  'buyer_phone',
  'buyer_address',
  'tenant_name',
  'tenant_document',
  'tenant_email',
  'tenant_phone',
  'tenant_address',
  'commission_percent_label',
  'rent_first_month_fee_percent',
  'rent_admin_fee_percent',
  'authorization_started_at_br',
  'authorization_expires_at_br',
  'contract_start_date',
  'contract_end_date',
  'contract_forum_city',
  'contract_forum_state',
  'guarantee_type',
  'management_centralized_label',
  'partner_name',
  'partner_document',
  'partner_email',
  'partner_creci',
  'partner_level',
] as const

export type MasterTemplatePlaceholder = (typeof MASTER_TEMPLATE_PLACEHOLDERS)[number]

type CompanyAliasSource = {
  company_trade_name?: unknown
  company_legal_name?: unknown
  company_cnpj?: unknown
  company_email?: unknown
  company_phone?: unknown
  company_website?: unknown
  address_street?: unknown
  address_number?: unknown
  address_complement?: unknown
  address_neighborhood?: unknown
  address_city?: unknown
  address_state?: unknown
  address_zip?: unknown
}

function asString(value: unknown): string {
  return String(value ?? '')
}

export function buildLegacyCompanyAliasFields(source: CompanyAliasSource): Record<string, unknown> {
  return {
    trade_name: source.company_trade_name ?? null,
    legal_name: source.company_legal_name ?? null,
    cnpj: source.company_cnpj ?? null,
    email: source.company_email ?? null,
    phone: source.company_phone ?? null,
    website: source.company_website ?? null,
    address_street: asString(source.address_street),
    address_number: asString(source.address_number),
    address_complement: asString(source.address_complement),
    address_neighborhood: asString(source.address_neighborhood),
    address_city: asString(source.address_city),
    address_state: asString(source.address_state),
    address_zip: asString(source.address_zip),
  }
}
