import { createAdminClient } from '@/lib/supabase/admin'
import { AUTHORIZATION_TEMPLATE_CODES, buildAuthorizationSnapshot } from '@/lib/documents/esign'
import { createClient } from '@/lib/supabaseServer'
import { type ESignSignerInput } from '@/lib/integrations/esign/zapsign'
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
  commission_percent: number | null
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

export async function getActorProfile(): Promise<{ actor: ActorProfile | null; error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { actor: null, error: 'Não autenticado.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return { actor: null, error: profileError?.message || 'Perfil não encontrado.' }
  }

  if (profile.is_active !== true) {
    return { actor: null, error: 'Usuário inativo.' }
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
    return { ok: false, status: 400, error: 'template_code é obrigatório.' }
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
        `Template ${templateCode} não encontrado. Verifique a migration de assinatura digital.`,
    }
  }

  const template = templateRow as TemplateRow
  if (template.provider === 'zapsign' && !template.provider_template_id) {
    const message =
      `Template ${template.code} sem provider_template_id configurado. ` +
      'Preencha o ID do modelo ZapSign em document_templates.'
    if (validateForCreation) {
      return { ok: false, status: 422, error: message }
    }
  }

  let property: PropertyRow | null = null
  let saleCommissionPercent: number | null = null
  let ownerPerson: PersonRow | null = null

  if (propertyId) {
    const propertyRes = await admin
      .from('properties')
      .select(
        'id,title,purpose,owner_user_id,owner_client_id,registry_number,address,address_number,address_complement,neighborhood,city,state,postal_code,price,commission_percent,authorization_started_at,authorization_expires_at,authorization_is_exclusive'
      )
      .eq('id', propertyId)
      .maybeSingle()

    if (propertyRes.error || !propertyRes.data) {
      return {
        ok: false,
        status: 404,
        error: propertyRes.error?.message || 'Imóvel não encontrado.',
      }
    }

    property = propertyRes.data as PropertyRow

    const canManageProperty = isManager(actor.role) || property.owner_user_id === actor.id
    if (!canManageProperty) {
      return { ok: false, status: 403, error: 'Sem permissão para este imóvel.' }
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
      // fallback para properties.commission_percent
    }

    if (property.owner_client_id) {
      const ownerRes = await admin
        .from('people')
        .select('id, full_name, email, phone_e164, document_id')
        .eq('id', property.owner_client_id)
        .maybeSingle()
      if (!ownerRes.error && ownerRes.data) {
        ownerPerson = ownerRes.data as PersonRow
      }
    }
  } else if (!isManager(actor.role)) {
    return {
      ok: false,
      status: 403,
      error: 'Somente admin/gestor pode gerar documento sem property_id.',
    }
  }

  const ownerPersonId = asString(body.owner_person_id) || ownerPerson?.id || null
  const primaryPersonId = asString(body.primary_person_id) || ownerPersonId || null
  const negotiationId = asString(body.negotiation_id) || null
  const leaseId = asString(body.lease_id) || null

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
        commission_percent: saleCommissionPercent ?? property.commission_percent,
        authorization_started_at: property.authorization_started_at,
        authorization_expires_at: property.authorization_expires_at,
        authorization_is_exclusive: property.authorization_is_exclusive,
      })
    : null

  const missingFields: string[] = []
  if (isAuthorizationTemplate(templateCode)) {
    if (!authorizationSnapshot?.registry_number) missingFields.push('Matrícula/registro')
    if (!authorizationSnapshot?.full_address) missingFields.push('Endereço completo')
    if (authorizationSnapshot?.sale_price === null || authorizationSnapshot?.sale_price === undefined) {
      missingFields.push('Valor do imóvel')
    }
    if (
      authorizationSnapshot?.commission_percent === null ||
      authorizationSnapshot?.commission_percent === undefined
    ) {
      missingFields.push('Comissão (%)')
    }
    if (!authorizationSnapshot?.authorization_expires_at) missingFields.push('Prazo de autorização')
  }

  if (!template.provider_template_id) {
    missingFields.push('Template ZapSign (provider_template_id)')
  }

  if (validateForCreation && missingFields.length > 0) {
    return {
      ok: false,
      status: 422,
      error: `Campos obrigatórios ausentes para autorização: ${missingFields.join(', ')}`,
      missing_fields: missingFields,
    }
  }

  const incomingSigners = normalizeSignerList(body.signers)
  const signers: ESignSignerInput[] = incomingSigners.length > 0 ? incomingSigners : []

  if (signers.length === 0) {
    if (ownerPerson?.email && ownerPerson.full_name) {
      signers.push({
        role: 'owner',
        name: ownerPerson.full_name,
        email: ownerPerson.email.toLowerCase(),
        phone: ownerPerson.phone_e164 || null,
      })
    }

    if (actor.email) {
      signers.push({
        role: 'vitrya',
        name: actor.full_name || 'Vitrya Imóveis',
        email: actor.email.toLowerCase(),
        phone: null,
      })
    }

    if (actor.role === 'corretor' && actor.email) {
      const brokerEmail = actor.email.toLowerCase()
      if (!signers.some((item) => item.email.toLowerCase() === brokerEmail)) {
        signers.push({
          role: 'broker',
          name: actor.full_name || 'Corretor',
          email: brokerEmail,
          phone: null,
        })
      }
    }
  }

  if (validateForCreation && signers.length === 0) {
    return {
      ok: false,
      status: 422,
      error: 'Não foi possível montar a lista de assinantes.',
    }
  }

  if (!validateForCreation && signers.length === 0) {
    missingFields.push('Assinantes')
  }

  const generatedAt = new Date()

  const templateFields: Record<string, unknown> = {
    template_code: templateCode,
    property_id: property?.id ?? null,
    property_title: property?.title ?? null,
    property_purpose: property?.purpose ?? null,
    property_registry_number: authorizationSnapshot?.registry_number ?? null,
    property_address: authorizationSnapshot?.full_address ?? null,
    property_sale_price: authorizationSnapshot?.sale_price ?? null,
    commission_percent: authorizationSnapshot?.commission_percent ?? null,
    authorization_started_at: authorizationSnapshot?.authorization_started_at ?? null,
    authorization_expires_at: authorizationSnapshot?.authorization_expires_at ?? null,
    authorization_is_exclusive: authorizationSnapshot?.authorization_is_exclusive ?? null,
    owner_name: ownerPerson?.full_name ?? null,
    owner_document: ownerPerson?.document_id ?? null,
    owner_email: ownerPerson?.email ?? null,
    owner_phone: ownerPerson?.phone_e164 ?? null,
    vitrya_signer_name: actor.full_name || null,
    vitrya_signer_email: actor.email || null,
    generated_at: generatedAt.toISOString(),
    authorization_is_exclusive_label: authorizationSnapshot?.authorization_is_exclusive ? 'SIM' : 'NÃO',
    property_sale_price_brl: formatCurrencyBRL(authorizationSnapshot?.sale_price),
    commission_percent_label: formatPercent(authorizationSnapshot?.commission_percent),
    authorization_expires_at_br: formatDateBR(authorizationSnapshot?.authorization_expires_at),
    generated_at_br: formatDateTimeBR(generatedAt),
  }

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
