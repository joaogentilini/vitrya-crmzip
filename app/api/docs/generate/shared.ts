import { createAdminClient } from '@/lib/supabase/admin'
import { buildCompanyFullAddress, getCompanyDocumentsEmail, getCompanySettingsAdmin } from '@/lib/companySettings'
import { AUTHORIZATION_TEMPLATE_CODES, buildAuthorizationSnapshot } from '@/lib/documents/esign'
import { buildLegacyCompanyAliasFields } from '@/lib/documents/templateFields'
import { type ESignSignerInput } from '@/lib/integrations/esign/zapsign'
import { createClient } from '@/lib/supabaseServer'
import { formatCurrencyBRL, formatDateBR, formatDateTimeBR, formatPercent } from '@/lib/utils/formatters'

export type GenerateBody = {
  template_code?: string
  entity_type?: string
  entity_id?: string
  property_id?: string
  owner_person_id?: string
  primary_person_id?: string
  negotiation_id?: string
  lease_id?: string
  signers?: Array<{
    role?: string
    name?: string
    email?: string
    phone?: string | null
  }>
}

export type ActorProfile = {
  id: string
  role: string
  is_active: boolean
  full_name: string | null
  email: string | null
}

type PropertyRow = {
  id: string
  title: string | null
  purpose: string | null
  owner_user_id: string | null
  owner_client_id: string | null
  registry_number: string | null
  address: string | null
  address_number: string | null
  address_complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  price: number | null
  rent_price: number | null
  commission_percent: number | null
  sale_commission_percent: number | null
  rent_commission_percent: number | null
  rent_first_month_fee_enabled: boolean | null
  rent_first_month_fee_percent: number | null
  rent_admin_fee_enabled: boolean | null
  rent_admin_fee_percent: number | null
  contract_forum_city: string | null
  contract_forum_state: string | null
  authorization_started_at: string | null
  authorization_expires_at: string | null
  authorization_is_exclusive: boolean | null
}

export type TemplateRow = {
  id: string
  code: string
  title: string
  provider: string
  provider_template_id: string | null
  is_active: boolean
  settings: Record<string, unknown> | null
}

type PersonRow = {
  id: string
  full_name: string | null
  email: string | null
  phone_e164: string | null
  document_id: string | null
}

export type PreparedDocumentContext = {
  templateCode: string
  entityType: string
  entityId: string | null
  propertyId: string | null
  ownerPersonId: string | null
  primaryPersonId: string | null
  negotiationId: string | null
  leaseId: string | null
  template: TemplateRow
  property: PropertyRow | null
  ownerPerson: PersonRow | null
  authorizationSnapshot: ReturnType<typeof buildAuthorizationSnapshot> | null
  signers: ESignSignerInput[]
  templateFields: Record<string, unknown>
  missingFields: string[]
}

export type PrepareDocumentContextResult =
  | {
      ok: true
      data: PreparedDocumentContext
    }
  | {
      ok: false
      status: number
      error: string
      missing_fields?: string[]
    }

function asString(value: unknown): string {
  return String(value || '').trim()
}

function addDaysIso(base: Date, days: number): string {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

function isManager(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'gestor'
}

function isAuthorizationTemplate(code: string): boolean {
  return AUTHORIZATION_TEMPLATE_CODES.includes(code as (typeof AUTHORIZATION_TEMPLATE_CODES)[number])
}

export function mapTemplateCodeToDocType(code: string): string {
  if (code.startsWith('AUT_')) return 'authorization'
  if (code.includes('GESTAO')) return 'management_contract'
  if (code.includes('CONTRATO')) return 'contract'
  return 'other'
}

function normalizeSignerList(input: GenerateBody['signers']): ESignSignerInput[] {
  if (!Array.isArray(input)) return []

  const result: ESignSignerInput[] = []
  for (const item of input) {
    const role = asString(item?.role) || 'signer'
    const name = asString(item?.name)
    const email = asString(item?.email).toLowerCase()
    const phone = asString(item?.phone)
    if (!name || !email) continue
    if (result.some((existing) => existing.email.toLowerCase() === email)) continue
    result.push({
      role,
      name,
      email,
      phone: phone || null,
    })
  }

  return result
}

function addSignerUnique(signers: ESignSignerInput[], signer: ESignSignerInput | null): boolean {
  if (!signer) return false
  const email = asString(signer.email).toLowerCase()
  if (!email) return false
  if (signers.some((item) => item.email.toLowerCase() === email)) return false
  signers.push({
    role: signer.role || 'signer',
    name: asString(signer.name),
    email,
    phone: signer.phone || null,
  })
  return true
}

function isProviderTemplateUrl(value: string | null | undefined): boolean {
  return /^https?:\/\//i.test(String(value || '').trim())
}

async function findPersonById(
  admin: ReturnType<typeof createAdminClient>,
  personId: string | null
): Promise<PersonRow | null> {
  if (!personId) return null
  const { data, error } = await admin
    .from('people')
    .select('id, full_name, email, phone_e164, document_id')
    .eq('id', personId)
    .maybeSingle()
  if (error || !data) return null
  return data as PersonRow
}

function shouldTreatAsRent(property: PropertyRow | null): boolean {
  const purpose = String(property?.purpose || '').toLowerCase()
  return purpose.includes('rent') || purpose.includes('loca')
}

export async function getActorProfile(): Promise<{ actor: ActorProfile | null; error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { actor: null, error: 'Nao autenticado.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return { actor: null, error: profileError?.message || 'Perfil nao encontrado.' }
  }

  if (profile.is_active !== true) {
    return { actor: null, error: 'Usuario inativo.' }
  }

  return {
    actor: {
      id: profile.id,
      role: profile.role,
      is_active: profile.is_active,
      full_name: profile.full_name ?? null,
      email: profile.email ?? null,
    },
    error: null,
  }
}

export async function prepareDocumentContext(params: {
  admin: ReturnType<typeof createAdminClient>
  actor: ActorProfile
  body: GenerateBody
  validateForCreation: boolean
}): Promise<PrepareDocumentContextResult> {
  const { admin, actor, body, validateForCreation } = params

  const templateCode = asString(body.template_code).toUpperCase()
  if (!templateCode) {
    return { ok: false, status: 400, error: 'template_code e obrigatorio.' }
  }

  const entityType = asString(body.entity_type) || 'property'
  const propertyId = asString(body.property_id) || null
  const entityId = asString(body.entity_id) || propertyId || null

  const { data: templateRow, error: templateError } = await admin
    .from('document_templates')
    .select('id, code, title, provider, provider_template_id, is_active, settings')
    .eq('code', templateCode)
    .eq('is_active', true)
    .maybeSingle()

  if (templateError || !templateRow) {
    return {
      ok: false,
      status: 404,
      error:
        templateError?.message ||
        `Template ${templateCode} nao encontrado. Verifique a migration de assinatura digital.`,
    }
  }

  const template = templateRow as TemplateRow
  if (template.provider === 'zapsign' && !template.provider_template_id) {
    const message =
      `Template ${template.code} sem provider_template_id configurado. ` +
      'Preencha o token/uuid do modelo ZapSign em document_templates.'
    if (validateForCreation) {
      return { ok: false, status: 422, error: message }
    }
  }

  if (template.provider === 'zapsign' && isProviderTemplateUrl(template.provider_template_id)) {
    return {
      ok: false,
      status: 422,
      error: 'provider_template_id invalido: use apenas o token/uuid do template ZapSign, nunca a URL.',
    }
  }

  const companySettings = await getCompanySettingsAdmin()
  const companyFullAddress = buildCompanyFullAddress(companySettings)
  const vitryaSignerEmail = getCompanyDocumentsEmail(companySettings, actor.email)

  let property: PropertyRow | null = null
  let saleCommissionPercent: number | null = null
  let ownerPerson: PersonRow | null = null

  if (propertyId) {
    const propertyRes = await admin
      .from('properties')
      .select(
        'id,title,purpose,owner_user_id,owner_client_id,registry_number,address,address_number,address_complement,neighborhood,city,state,postal_code,price,rent_price,commission_percent,sale_commission_percent,rent_commission_percent,rent_first_month_fee_enabled,rent_first_month_fee_percent,rent_admin_fee_enabled,rent_admin_fee_percent,contract_forum_city,contract_forum_state,authorization_started_at,authorization_expires_at,authorization_is_exclusive'
      )
      .eq('id', propertyId)
      .maybeSingle()

    if (propertyRes.error || !propertyRes.data) {
      return {
        ok: false,
        status: 404,
        error: propertyRes.error?.message || 'Imovel nao encontrado.',
      }
    }

    property = propertyRes.data as PropertyRow

    const canManageProperty = isManager(actor.role) || property.owner_user_id === actor.id
    if (!canManageProperty) {
      return { ok: false, status: 403, error: 'Sem permissao para este imovel.' }
    }

    try {
      const commissionRes = await admin
        .from('property_commission_settings')
        .select('sale_commission_percent')
        .eq('property_id', property.id)
        .maybeSingle()

      if (!commissionRes.error && typeof commissionRes.data?.sale_commission_percent === 'number') {
        saleCommissionPercent = commissionRes.data.sale_commission_percent
      }
    } catch {
      // fallback para propriedades com colunas locais
    }

    if (property.owner_client_id) {
      ownerPerson = await findPersonById(admin, property.owner_client_id)
    }
  } else if (!isManager(actor.role)) {
    return {
      ok: false,
      status: 403,
      error: 'Somente admin/gestor pode gerar documento sem property_id.',
    }
  }

  const explicitOwnerPersonId = asString(body.owner_person_id) || null
  if (explicitOwnerPersonId) {
    const explicitOwner = await findPersonById(admin, explicitOwnerPersonId)
    if (explicitOwner) ownerPerson = explicitOwner
  }

  const ownerPersonId = explicitOwnerPersonId || ownerPerson?.id || null
  const primaryPersonId = asString(body.primary_person_id) || ownerPersonId || null
  const negotiationId = asString(body.negotiation_id) || null
  const leaseId = asString(body.lease_id) || null

  const primaryPerson = await findPersonById(admin, primaryPersonId)
  const buyerPerson = primaryPerson && primaryPerson.id !== ownerPersonId ? primaryPerson : null
  const tenantPerson = shouldTreatAsRent(property) ? primaryPerson : null

  const now = new Date()
  const authorizationStart = property?.authorization_started_at || now.toISOString()
  const authorizationExpires =
    property?.authorization_expires_at || addDaysIso(new Date(authorizationStart), 180)

  const authorizationSnapshot = property
    ? buildAuthorizationSnapshot({
        registry_number: property.registry_number,
        address: property.address,
        address_number: property.address_number,
        address_complement: property.address_complement,
        neighborhood: property.neighborhood,
        city: property.city,
        state: property.state,
        postal_code: property.postal_code,
        sale_price: property.price,
        commission_percent:
          saleCommissionPercent ?? property.sale_commission_percent ?? property.commission_percent,
        authorization_started_at: authorizationStart,
        authorization_expires_at: authorizationExpires,
        authorization_is_exclusive: property.authorization_is_exclusive,
      })
    : null

  const missingFields: string[] = []
  if (isAuthorizationTemplate(templateCode)) {
    if (!authorizationSnapshot?.registry_number) missingFields.push('Matricula/registro')
    if (!authorizationSnapshot?.full_address) missingFields.push('Endereco completo')
    if (authorizationSnapshot?.sale_price === null || authorizationSnapshot?.sale_price === undefined) {
      missingFields.push('Valor do imovel')
    }
    if (
      authorizationSnapshot?.commission_percent === null ||
      authorizationSnapshot?.commission_percent === undefined
    ) {
      missingFields.push('Comissao (%)')
    }
  }

  if (!template.provider_template_id) {
    missingFields.push('Template ZapSign (provider_template_id)')
  }

  if (validateForCreation && missingFields.length > 0) {
    return {
      ok: false,
      status: 422,
      error: `Campos obrigatorios ausentes para autorizacao: ${missingFields.join(', ')}`,
      missing_fields: missingFields,
    }
  }

  const signers = normalizeSignerList(body.signers)
  const shouldEnforceOwnerVitrya = templateCode === 'AUT_VENDA_V1'

  const ownerEmail = asString(ownerPerson?.email).toLowerCase()
  const ownerName = asString(ownerPerson?.full_name)
  const vitryaEmail = asString(vitryaSignerEmail).toLowerCase()
  const vitryaName =
    asString(companySettings?.trade_name) ||
    asString(companySettings?.legal_name) ||
    asString(actor.full_name) ||
    'Vitrya Imoveis'

  if (signers.length === 0 || shouldEnforceOwnerVitrya) {
    if (ownerEmail && ownerName) {
      addSignerUnique(signers, {
        role: 'owner',
        name: ownerName,
        email: ownerEmail,
        phone: ownerPerson?.phone_e164 || null,
      })
    }

    if (vitryaEmail) {
      addSignerUnique(signers, {
        role: 'vitrya',
        name: vitryaName,
        email: vitryaEmail,
        phone: null,
      })
    }
  }

  if (actor.role === 'corretor' && actor.email) {
    addSignerUnique(signers, {
      role: 'broker',
      name: asString(actor.full_name) || 'Corretor',
      email: actor.email.toLowerCase(),
      phone: null,
    })
  }

  if (shouldEnforceOwnerVitrya) {
    if (!ownerEmail || !ownerName) {
      missingFields.push('Assinante proprietario (nome/e-mail)')
    }
    if (!vitryaEmail) {
      missingFields.push('Assinante Vitrya (e-mail)')
    }
  }

  if (validateForCreation && signers.length === 0) {
    return {
      ok: false,
      status: 422,
      error: 'Nao foi possivel montar a lista de assinantes.',
      missing_fields: missingFields,
    }
  }

  if (validateForCreation && missingFields.length > 0) {
    return {
      ok: false,
      status: 422,
      error: `Campos obrigatorios ausentes para autorizacao: ${missingFields.join(', ')}`,
      missing_fields: missingFields,
    }
  }

  if (!validateForCreation && signers.length === 0) {
    missingFields.push('Assinantes')
  }

  const generatedAt = new Date()
  const forumCity =
    asString(property?.contract_forum_city) ||
    asString(companySettings?.default_forum_city) ||
    'Lucas do Rio Verde'
  const forumState =
    asString(property?.contract_forum_state) ||
    asString(companySettings?.default_forum_state) ||
    'MT'

  const companyTradeName =
    asString(companySettings?.trade_name) || asString(companySettings?.legal_name) || null
  const companyLegalName = asString(companySettings?.legal_name) || null
  const companyCnpj = asString(companySettings?.cnpj) || null
  const companyEmail = asString(companySettings?.email) || null
  const companyPhone = asString(companySettings?.phone) || null
  const companyWebsite = asString(companySettings?.website) || null
  const companyCreci = asString(companySettings?.creci_company) || null

  const salePrice = authorizationSnapshot?.sale_price ?? null
  const rentPrice = property?.rent_price ?? null
  const saleCommissionValue =
    authorizationSnapshot?.commission_percent ??
    property?.sale_commission_percent ??
    property?.commission_percent ??
    null
  const managementCentralized = Boolean(authorizationSnapshot?.authorization_is_exclusive)

  const templateFields: Record<string, unknown> = {
    company_trade_name: companyTradeName,
    company_legal_name: companyLegalName,
    company_cnpj: companyCnpj,
    company_creci: companyCreci,
    company_email: companyEmail,
    company_phone: companyPhone,
    company_full_address: companyFullAddress || null,
    company_website: companyWebsite,
    document_number: null,
    generated_at_br: formatDateTimeBR(generatedAt),
    verify_url: null,
    property_id: property?.id ?? null,
    property_title: property?.title ?? null,
    property_registry_number: authorizationSnapshot?.registry_number ?? null,
    property_address: authorizationSnapshot?.full_address ?? null,
    property_sale_price_brl: formatCurrencyBRL(salePrice),
    property_rent_price_brl: formatCurrencyBRL(rentPrice),
    property_purpose: property?.purpose ?? null,
    owner_name: ownerPerson?.full_name ?? null,
    owner_document: ownerPerson?.document_id ?? null,
    owner_email: ownerPerson?.email ?? null,
    owner_phone: ownerPerson?.phone_e164 ?? null,
    owner_address: null,
    buyer_name: buyerPerson?.full_name ?? null,
    buyer_document: buyerPerson?.document_id ?? null,
    buyer_email: buyerPerson?.email ?? null,
    buyer_phone: buyerPerson?.phone_e164 ?? null,
    buyer_address: null,
    tenant_name: tenantPerson?.full_name ?? null,
    tenant_document: tenantPerson?.document_id ?? null,
    tenant_email: tenantPerson?.email ?? null,
    tenant_phone: tenantPerson?.phone_e164 ?? null,
    tenant_address: null,
    commission_percent_label: formatPercent(saleCommissionValue),
    rent_first_month_fee_percent:
      property?.rent_first_month_fee_enabled && property?.rent_first_month_fee_percent !== null
        ? formatPercent(property.rent_first_month_fee_percent)
        : '',
    rent_admin_fee_percent:
      property?.rent_admin_fee_enabled && property?.rent_admin_fee_percent !== null
        ? formatPercent(property.rent_admin_fee_percent)
        : '',
    authorization_started_at_br: formatDateBR(authorizationStart),
    authorization_expires_at_br: formatDateBR(authorizationExpires),
    contract_start_date: '',
    contract_end_date: '',
    contract_forum_city: forumCity,
    contract_forum_state: forumState,
    guarantee_type: '',
    management_centralized_label: managementCentralized ? 'SIM' : 'NÃO',
    partner_name: null,
    partner_document: null,
    partner_email: null,
    partner_creci: null,
    partner_level: null,
    // Compatibilidade legada/autocomplete de templates antigos:
    template_code: templateCode,
    property_sale_price: salePrice,
    commission_percent: saleCommissionValue,
    authorization_started_at: authorizationStart,
    authorization_expires_at: authorizationExpires,
    authorization_is_exclusive: managementCentralized,
    authorization_is_exclusive_label: managementCentralized ? 'SIM' : 'NÃO',
    vitrya_signer_name: vitryaName,
    vitrya_signer_email: vitryaEmail || null,
    generated_at: generatedAt.toISOString(),
  }

  Object.assign(
    templateFields,
    buildLegacyCompanyAliasFields({
      company_trade_name: companyTradeName,
      company_legal_name: companyLegalName,
      company_cnpj: companyCnpj,
      company_email: companyEmail,
      company_phone: companyPhone,
      company_website: companyWebsite,
      address_street: companySettings?.address_street ?? '',
      address_number: companySettings?.address_number ?? '',
      address_complement: companySettings?.address_complement ?? '',
      address_neighborhood: companySettings?.address_neighborhood ?? '',
      address_city: companySettings?.address_city ?? '',
      address_state: companySettings?.address_state ?? '',
      address_zip: companySettings?.address_zip ?? '',
    })
  )

  return {
    ok: true,
    data: {
      templateCode,
      entityType,
      entityId,
      propertyId,
      ownerPersonId,
      primaryPersonId,
      negotiationId,
      leaseId,
      template,
      property,
      ownerPerson,
      authorizationSnapshot,
      signers,
      templateFields,
      missingFields,
    },
  }
}
