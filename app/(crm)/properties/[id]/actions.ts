'use server'

import { createClient } from '@/lib/supabaseServer'
import { revalidatePath } from 'next/cache'
import { hasSignedContractDoc, hasValidatedAuthorizationDoc } from './publish-guard'
import { requireActiveUser } from '@/lib/auth'

export interface PublishResult {
  success: boolean
  error?: string

}

export async function publishProperty(propertyId: string): Promise<PublishResult> {
  const supabase = await createClient()

  // verificar role do usuário: apenas admin ou gestor podem aprovar publicações
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false, error: 'Não autenticado' }
  }

  const userId = userRes.user.id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return { success: false, error: `Erro ao verificar perfil: ${profileError.message}` }
  }

  const isAdmin = profile?.role === 'admin' && profile?.is_active
  const isGestor = profile?.role === 'gestor' && profile?.is_active
  if (!isAdmin && !isGestor) {
    return { success: false, error: 'Apenas admin/gestor podem aprovar publicações' }
  }

  const hasAuthorization = await hasValidatedAuthorizationDoc(propertyId)

  if (!hasAuthorization) {
    return {
      success: false,
      error:
        'Para publicar o imóvel, anexe e valide o Termo de Autorização do proprietário em "Imóveis → Documentos".',
    }
  }

  const { error: updateError } = await supabase
    .from('properties')
    .update({ status: 'active' })
    .eq('id', propertyId)

  if (updateError) {
    return {
      success: false,
      error: `Erro ao publicar imóvel: ${updateError.message}`,
    }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')

  return { success: true }
}

export async function unpublishProperty(propertyId: string): Promise<PublishResult> {
  const supabase = await createClient()

  // verificar role do usuário: apenas admin ou gestor podem reprovar/despublicar
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false, error: 'Não autenticado' }
  }

  const userId = userRes.user.id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return { success: false, error: `Erro ao verificar perfil: ${profileError.message}` }
  }

  const isAdmin = profile?.role === 'admin' && profile?.is_active
  const isGestor = profile?.role === 'gestor' && profile?.is_active
  if (!isAdmin && !isGestor) {
    return { success: false, error: 'Apenas admin/gestor podem reprovar/despublicar' }
  }

  const { error: updateError } = await supabase
    .from('properties')
    .update({ status: 'draft' })
    .eq('id', propertyId)

  if (updateError) {
    return {
      success: false,
     error: `Erro ao despublicar imóvel: ${updateError.message}`,
    }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')

  return { success: true }
}

export async function checkAuthorizationDocument(propertyId: string): Promise<boolean> {
  return hasValidatedAuthorizationDoc(propertyId)
}

export interface PropertyFeatureCatalogItem {
  id: string
  key: string
  label_pt: string
  group?: string | null
  type: string
  options?: unknown
  position?: number | null
}

export interface PropertyFeatureValueRow {
  feature_id: string
  value_boolean: boolean | null
  value_number: number | null
  value_text: string | null
  value_json: unknown | null
}

export async function getPropertyFeaturesData(propertyId: string) {
  const supabase = await createClient()

  const [catalogRes, valuesRes] = await Promise.all([
    supabase
      .from('property_features')
      .select('id,key,label_pt,group,type,options,position')
      .eq('is_active', true)
      .order('position', { ascending: true }),
    supabase
      .from('property_feature_values')
      .select('feature_id,value_boolean,value_number,value_text,value_json')
      .eq('property_id', propertyId),
  ])

  if (catalogRes.error || valuesRes.error) {
    console.error('Erro ao carregar características:', catalogRes.error || valuesRes.error)
    return { catalog: [], values: [] }
  }

  return {
    catalog: (catalogRes.data ?? []) as PropertyFeatureCatalogItem[],
    values: (valuesRes.data ?? []) as PropertyFeatureValueRow[],
  }
}

export interface UpdatePropertyFeatureItem {
  feature_id: string
  type: string
  value: unknown
}

export async function updatePropertyFeatures(
  propertyId: string,
  items: UpdatePropertyFeatureItem[]
): Promise<{ success: boolean; error?: string }> {
  await requireActiveUser()

  const supabase = await createClient()

  // 🔐 Permissão: apenas owner do imóvel OU admin/gestor
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false, error: 'Não autenticado.' }
  }
  const userId = userRes.user.id

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('owner_user_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (propertyError || !property) {
    return { success: false, error: 'Imóvel não encontrado.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profile?.is_active) {
    return { success: false, error: 'Perfil inválido ou inativo.' }
  }

  const isAdmin = profile.role === 'admin'
  const isGestor = profile.role === 'gestor'
  const isOwner = property.owner_user_id === userId

  if (!isAdmin && !isGestor && !isOwner) {
    return {
      success: false,
      error: 'Você não tem permissão para editar as características deste imóvel.',
    }
  }

  const tasks = items.map((item) => {
    const featureId = item.feature_id
    const type = item.type
    const value = item.value

    if (type === 'boolean') {
      if (value === true) {
        return supabase.from('property_feature_values').upsert(
          {
            property_id: propertyId,
            feature_id: featureId,
            value_boolean: true,
            value_number: null,
            value_text: null,
            value_json: null,
          },
          { onConflict: 'property_id,feature_id' }
        )
      }
      return supabase
        .from('property_feature_values')
        .delete()
        .eq('property_id', propertyId)
        .eq('feature_id', featureId)
    }

    if (type === 'enum' || type === 'text') {
      if (typeof value === 'string' && value.trim()) {
        return supabase.from('property_feature_values').upsert(
          {
            property_id: propertyId,
            feature_id: featureId,
            value_boolean: null,
            value_number: null,
            value_text: value.trim(),
            value_json: null,
          },
          { onConflict: 'property_id,feature_id' }
        )
      }
      return supabase
        .from('property_feature_values')
        .delete()
        .eq('property_id', propertyId)
        .eq('feature_id', featureId)
    }

    if (type === 'multi_enum') {
      if (Array.isArray(value) && value.length > 0) {
        return supabase.from('property_feature_values').upsert(
          {
            property_id: propertyId,
            feature_id: featureId,
            value_boolean: null,
            value_number: null,
            value_text: null,
            value_json: value,
          },
          { onConflict: 'property_id,feature_id' }
        )
      }
      return supabase
        .from('property_feature_values')
        .delete()
        .eq('property_id', propertyId)
        .eq('feature_id', featureId)
    }

    if (type === 'number') {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return supabase.from('property_feature_values').upsert(
          {
            property_id: propertyId,
            feature_id: featureId,
            value_boolean: null,
            value_number: value,
            value_text: null,
            value_json: null,
          },
          { onConflict: 'property_id,feature_id' }
        )
      }
      return supabase
        .from('property_feature_values')
        .delete()
        .eq('property_id', propertyId)
        .eq('feature_id', featureId)
    }

    return supabase
      .from('property_feature_values')
      .delete()
      .eq('property_id', propertyId)
      .eq('feature_id', featureId)
  })

  const results = await Promise.all(tasks)
  const firstError = results.find((res) => res.error)?.error
  if (firstError) {
    return { success: false, error: firstError.message }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')

  return { success: true }
}

export interface UpdatePropertyData {
  title: string
  purpose: string

  // ✅ categoria/classificação (nova)
  property_category_id?: string | null

  city?: string | null
  neighborhood?: string | null
  address?: string | null
  price?: number | null
  rent_price?: number | null
  area_m2?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  parking?: number | null
  suites?: number | null
  description?: string | null
}

export interface UpdatePropertyResult {
  success: boolean
  data?: UpdatePropertyData
  error?: string
}

export async function updatePropertyAction(
  propertyId: string,
  data: UpdatePropertyData
): Promise<UpdatePropertyResult> {
  const supabase = await createClient()

  // ✅ 1x auth.getUser
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false, error: 'Não autenticado' }
  }
  const userId = userRes.user.id

  // Verificar permissões: admin/gestor OU owner do imóvel
  const { data: property, error: fetchError } = await supabase
    .from('properties')
    .select('owner_user_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (fetchError) {
    return {
      success: false,
      error: `Erro ao verificar permissões: ${fetchError.message}`,
    }
  }

  if (!property) {
    return {
      success: false,
      error: 'Imóvel não encontrado',
    }
  }

  // Verificar se usuário é admin/gestor ou proprietário
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return {
      success: false,
      error: `Erro ao verificar perfil: ${profileError.message}`,
    }
  }

  const isAdmin = profile?.role === 'admin' && profile?.is_active
  const isGestor = profile?.role === 'gestor' && profile?.is_active
  const isOwner = property.owner_user_id === userId

  if (!isAdmin && !isGestor && !isOwner) {
    return {
      success: false,
      error: 'Você não tem permissão para editar este imóvel',
    }
  }

  // ✅ normalização leve (evita mandar undefined)
  const patch: Record<string, any> = {
    title: data.title,
    purpose: data.purpose,

    // ✅ novo campo
    property_category_id:
      typeof data.property_category_id === 'undefined' ? undefined : data.property_category_id,

    city: typeof data.city === 'undefined' ? undefined : data.city,
    neighborhood: typeof data.neighborhood === 'undefined' ? undefined : data.neighborhood,
    address: typeof data.address === 'undefined' ? undefined : data.address,
    price: typeof data.price === 'undefined' ? undefined : data.price,
    rent_price: typeof data.rent_price === 'undefined' ? undefined : data.rent_price,
    area_m2: typeof data.area_m2 === 'undefined' ? undefined : data.area_m2,
    bedrooms: typeof data.bedrooms === 'undefined' ? undefined : data.bedrooms,
    bathrooms: typeof data.bathrooms === 'undefined' ? undefined : data.bathrooms,
    parking: typeof data.parking === 'undefined' ? undefined : data.parking,
    suites: typeof data.suites === 'undefined' ? undefined : data.suites,
    description: typeof data.description === 'undefined' ? undefined : data.description,
    updated_at: new Date().toISOString(),
  }

  // remove chaves undefined (Supabase update ignora, mas aqui fica limpo)
  for (const k of Object.keys(patch)) {
    if (typeof patch[k] === 'undefined') delete patch[k]
  }

  const { error: updateError } = await supabase.from('properties').update(patch).eq('id', propertyId)

  if (updateError) {
    return {
      success: false,
      error: `Erro ao atualizar imóvel: ${updateError.message}`,
    }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')
  revalidatePath('/properties/my')

  return {
    success: true,
    data,
  }
}

export interface UpdatePropertyPayload {
  status?: string | null
  purpose?: string | null
  title?: string | null
  description?: string | null
  city?: string | null
  neighborhood?: string | null
  address?: string | null
  address_number?: string | null
  address_complement?: string | null
  state?: string | null
  postal_code?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  price?: number | string | null
  rent_price?: number | string | null
  sale_value?: number | string | null
  appraisal_value?: number | string | null
  down_payment_value?: number | string | null
  usage?: string | null
  condition?: string | null
  accepts_financing?: boolean | null
  accepts_trade?: boolean | null
  property_standard?: string | null
  artesian_well?: boolean | null
  area_m2?: number | string | null
  bedrooms?: number | string | null
  bathrooms?: number | string | null
  parking?: number | string | null
  suites?: number | string | null
  condo_fee?: number | string | null
  commission_percent?: number | string | null
  sale_commission_percent?: number | string | null
  sale_broker_split_percent?: number | string | null
  sale_partner_split_percent?: number | string | null
  rent_initial_commission_percent?: number | string | null
  rent_recurring_commission_percent?: number | string | null
  rent_broker_split_percent?: number | string | null
  rent_partner_split_percent?: number | string | null
  registry_number?: string | null
  registry_office?: string | null
  iptu_value?: number | string | null
  iptu_year?: number | string | null
  iptu_is_paid?: boolean | null
  owner_client_id?: string | null
  owner_user_id?: string | null
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  lead_type_id?: string | null
  cover_media_url?: string | null
  property_category_id?: string | null
  year_built?: number | string | null
  is_renovated?: boolean | null
  renovated_at?: string | null
  owner_person_id?: string | null
  land_area_m2?: number | string | null
  built_area_m2?: number | string | null
}

export async function updatePropertyBasics(propertyId: string, payload: UpdatePropertyPayload) {
  const actorProfile = await requireActiveUser()

  if (!propertyId) {
    throw new Error('Imóvel inválido.')
  }

  const supabase = await createClient()

  const { data: propertyOwner, error: propertyError } = await supabase
    .from('properties')
    .select('owner_user_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (propertyError) {
    throw new Error(propertyError.message || 'Erro ao validar permissao de edicao.')
  }

  if (!propertyOwner) {
    throw new Error('Imovel nao encontrado.')
  }

  const isManager = actorProfile.role === 'admin' || actorProfile.role === 'gestor'
  const isOwner = propertyOwner.owner_user_id === actorProfile.id
  if (!isManager && !isOwner) {
    throw new Error('Sem permissao: apenas responsavel/admin/gestor.')
  }

  const parsePercentField = (value: unknown, label: string): number | undefined => {
    if (typeof value === 'undefined') return undefined
    if (value === null) return undefined

    let parsed: number
    if (typeof value === 'number') {
      parsed = value
    } else if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return undefined
      parsed = Number(trimmed.replace(',', '.'))
    } else {
      throw new Error(`${label} invalido.`)
    }

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new Error(`${label} invalido.`)
    }

    return parsed
  }

  const commissionSettingsUpdate: Record<string, number | string> = {}
  const saleCommissionPercent = parsePercentField(payload.sale_commission_percent, 'Comissao de venda (%)')
  if (typeof saleCommissionPercent === 'number') {
    commissionSettingsUpdate.sale_commission_percent = saleCommissionPercent
    // Mantem coluna legada sincronizada.
    payload.commission_percent = saleCommissionPercent
  }

  const saleBrokerSplitPercent = parsePercentField(payload.sale_broker_split_percent, 'Split corretor venda (%)')
  if (typeof saleBrokerSplitPercent === 'number') {
    commissionSettingsUpdate.sale_broker_split_percent = saleBrokerSplitPercent
  }

  const salePartnerSplitPercent = parsePercentField(payload.sale_partner_split_percent, 'Split parceiro venda (%)')
  if (typeof salePartnerSplitPercent === 'number') {
    commissionSettingsUpdate.sale_partner_split_percent = salePartnerSplitPercent
  }

  const rentInitialCommissionPercent = parsePercentField(
    payload.rent_initial_commission_percent,
    'Comissao inicial aluguel (%)'
  )
  if (typeof rentInitialCommissionPercent === 'number') {
    commissionSettingsUpdate.rent_initial_commission_percent = rentInitialCommissionPercent
  }

  const rentRecurringCommissionPercent = parsePercentField(
    payload.rent_recurring_commission_percent,
    'Comissao recorrente aluguel (%)'
  )
  if (typeof rentRecurringCommissionPercent === 'number') {
    commissionSettingsUpdate.rent_recurring_commission_percent = rentRecurringCommissionPercent
  }

  const rentBrokerSplitPercent = parsePercentField(payload.rent_broker_split_percent, 'Split corretor aluguel (%)')
  if (typeof rentBrokerSplitPercent === 'number') {
    commissionSettingsUpdate.rent_broker_split_percent = rentBrokerSplitPercent
  }

  const rentPartnerSplitPercent = parsePercentField(payload.rent_partner_split_percent, 'Split parceiro aluguel (%)')
  if (typeof rentPartnerSplitPercent === 'number') {
    commissionSettingsUpdate.rent_partner_split_percent = rentPartnerSplitPercent
  }

  if (
    typeof saleBrokerSplitPercent === 'number' &&
    typeof salePartnerSplitPercent === 'number' &&
    saleBrokerSplitPercent + salePartnerSplitPercent > 100
  ) {
    throw new Error('A soma dos splits de venda nao pode ultrapassar 100%.')
  }

  if (
    typeof rentBrokerSplitPercent === 'number' &&
    typeof rentPartnerSplitPercent === 'number' &&
    rentBrokerSplitPercent + rentPartnerSplitPercent > 100
  ) {
    throw new Error('A soma dos splits de aluguel nao pode ultrapassar 100%.')
  }

  if (payload.owner_client_id === '') {
    payload.owner_client_id = null
  }

  if (typeof payload.commission_percent === 'string') {
    const trimmed = payload.commission_percent.trim()
    payload.commission_percent = trimmed ? trimmed.replace(',', '.') : null
  }

  if (payload.commission_percent !== null && typeof payload.commission_percent !== 'undefined') {
    const commissionPercent = Number(payload.commission_percent)
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      throw new Error('Percentual de comissao invalido.')
    }
    payload.commission_percent = commissionPercent
  }

  if (Object.keys(commissionSettingsUpdate).length > 0) {
    const commissionSettingsRow = {
      property_id: propertyId,
      updated_by_profile_id: actorProfile.id,
      ...commissionSettingsUpdate,
    }

    const { error: commissionSettingsError } = await supabase
      .from('property_commission_settings')
      .upsert(commissionSettingsRow as any, { onConflict: 'property_id' })

    if (commissionSettingsError) {
      throw new Error(
        commissionSettingsError.message ||
          'Erro ao salvar configuracao de comissao. Verifique a migration 202602141030.'
      )
    }
  }

  if (payload.owner_client_id) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.owner_client_id
    )

    if (!isUuid) {
      throw new Error('Proprietário inválido: ID em formato incorreto.')
    }

    const { data: personExists, error: personErr } = await supabase
      .from('people')
      .select('id')
      .eq('id', payload.owner_client_id)
      .maybeSingle()

    if (personErr) {
      throw new Error(personErr.message || 'Erro ao validar proprietário.')
    }

    if (!personExists) {
      throw new Error('Proprietário inválido: a pessoa selecionada não existe.')
    }
  }

  const updatePayload: Record<string, unknown> = { ...payload }
  const commissionSettingKeys = [
    'sale_commission_percent',
    'sale_broker_split_percent',
    'sale_partner_split_percent',
    'rent_initial_commission_percent',
    'rent_recurring_commission_percent',
    'rent_broker_split_percent',
    'rent_partner_split_percent',
  ]
  for (const key of commissionSettingKeys) {
    delete updatePayload[key]
  }

  for (const key of Object.keys(updatePayload)) {
    if (typeof updatePayload[key] === 'undefined') {
      delete updatePayload[key]
    }
  }

  const { error } = await supabase.from('properties').update(updatePayload).eq('id', propertyId)

  if (error) {
    throw new Error(error.message || 'Erro ao atualizar imóvel.')
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')
}

/** ✅ Resultado padronizado para o modal (sem throw) */
export type PersonSearchRow = {
  id: string
  full_name?: string | null
  email?: string | null
  document_id?: string | null
  phone_e164?: string | null
  kind_tags?: string[] | null
}

export type SearchPeopleResult = { ok: true; data: PersonSearchRow[] } | { ok: false; error: string }

export async function searchPeople(query: string): Promise<SearchPeopleResult> {
  try {
    await requireActiveUser()

    const supabase = await createClient()
    const term = (query ?? '').trim()

    let baseQuery = supabase
      .from('people')
      .select('id, full_name, email, document_id, phone_e164, kind_tags, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50)

    const { data, error } = term
      ? await baseQuery.or(
          `full_name.ilike.%${term}%,email.ilike.%${term}%,document_id.ilike.%${term}%,phone_e164.ilike.%${term}%`
        )
      : await baseQuery

    if (error) {
      return { ok: false, error: error.message || 'Erro ao buscar pessoas.' }
    }

    return { ok: true, data: (data ?? []) as PersonSearchRow[] }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro inesperado ao buscar pessoas.' }
  }
}

export interface AddPropertyMediaPayload {
  url: string
  kind: 'image' | 'video'
  position?: number | null
}

export async function addPropertyMedia(propertyId: string, payload: AddPropertyMediaPayload) {
  await requireActiveUser()

  if (!propertyId) {
    throw new Error('Imóvel inválido.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('property_media').insert({
    property_id: propertyId,
    url: payload.url,
    kind: payload.kind,
    position: payload.position ?? null,
  })

  if (error) {
    throw new Error(error.message || 'Erro ao adicionar mídia.')
  }

  revalidatePath(`/properties/${propertyId}`)
}

export async function removePropertyMedia(mediaId: string, propertyId: string) {
  await requireActiveUser()

  if (!mediaId) {
    throw new Error('Mídia inválida.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('property_media').delete().eq('id', mediaId)

  if (error) {
    throw new Error(error.message || 'Erro ao remover mídia.')
  }

  revalidatePath(`/properties/${propertyId}`)
}

export async function getPropertyLeads(propertyId: string) {
  await requireActiveUser()

  if (!propertyId) {
    throw new Error('Imóvel inválido.')
  }

  const supabase = await createClient()

  // 1) Leads do imóvel
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, title, status, value_estimate, created_at, stage_id, person_id, name, phone_e164, email')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })

  if (leadsError) {
    throw new Error(leadsError.message || 'Erro ao carregar negociações.')
  }

  const leadIds = (leads ?? []).map((l: any) => l.id).filter(Boolean)
  if (leadIds.length === 0) return leads ?? []

  // 2) Mapear property_negotiations (negociação real) para cada lead
  // Assumindo coluna padrão: property_negotiations.lead_id
  const { data: negs, error: negError } = await supabase
    .from('property_negotiations')
    .select('id, lead_id')
    .eq('property_id', propertyId)
    .in('lead_id', leadIds)

  if (negError) {
    throw new Error(negError.message || 'Erro ao mapear negociações do imóvel.')
  }

  const map = new Map<string, string>()
  ;(negs ?? []).forEach((n: any) => {
    if (n?.lead_id && n?.id) map.set(n.lead_id, n.id)
  })

  // 3) Retornar leads + property_negotiation_id
  return (leads ?? []).map((l: any) => ({
    ...l,
    property_negotiation_id: map.get(l.id) ?? null,
  }))
}

export async function updatePropertyDealStatus(
  propertyId: string,
  next: 'reserved' | 'sold' | null
): Promise<{ success: boolean; error?: string }> {
  await requireActiveUser()
  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) return { success: false, error: 'Não autenticado' }
  const userId = userRes.user.id

  const { data: prop, error: propErr } = await supabase
    .from('properties')
    .select('id, owner_user_id, property_category_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (propErr) return { success: false, error: propErr.message }
  if (!prop) return { success: false, error: 'Imóvel não encontrado' }

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (profErr) return { success: false, error: profErr.message }

  const isAdmin = profile?.role === 'admin' && profile?.is_active
  const isGestor = profile?.role === 'gestor' && profile?.is_active
  const isOwner = prop.owner_user_id === userId

  if (!isAdmin && !isGestor && !isOwner) {
    return { success: false, error: 'Sem permissão: apenas responsável/admin/gestor.' }
  }
  if (next === 'sold') {
    const [{ data: approvedProposal, error: proposalErr }, hasContract] = await Promise.all([
      supabase
        .from('property_proposals')
        .select('id, status, approved_at')
        .eq('property_id', propertyId)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      hasSignedContractDoc(propertyId),
    ])

    if (proposalErr) {
      return { success: false, error: proposalErr.message || 'Erro ao validar proposta aprovada.' }
    }

    if (!approvedProposal) {
      return { success: false, error: 'Para marcar como vendido, aprove uma proposta primeiro.' }
    }

    if (!hasContract) {
      return {
        success: false,
        error: 'Para marcar como vendido, anexe e valide o contrato assinado em Documentos do imóvel.',
      }
    }
  }
  const patch: any = {
    deal_status: next,
    deal_marked_at: next ? new Date().toISOString() : null,
    deal_visible_until: null,
  }

  // regra: "sold" fica 7 dias visível
  if (next === 'sold') {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    patch.deal_visible_until = d.toISOString()
  }

  const { error: upErr } = await supabase.from('properties').update(patch).eq('id', propertyId)
  if (upErr) return { success: false, error: upErr.message }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')
  return { success: true }
}

export async function createLeadQuickProposal(
  propertyId: string,
  payload: {
    title?: string | null
    name?: string | null
    email?: string | null
    phone_e164?: string | null
    value_estimate?: number | null
  }
): Promise<{ success: boolean; error?: string; lead?: any }> {
  await requireActiveUser()
  const supabase = await createClient()

  // garante user
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) return { success: false, error: 'Não autenticado' }
  const userId = userRes.user.id

  const insertRow: any = {
    property_id: propertyId,
    title: payload.title ?? 'Proposta',
    status: 'proposta',
    value_estimate: payload.value_estimate ?? null,
    name: payload.name ?? null,
    phone_e164: payload.phone_e164 ?? null,
    email: payload.email ?? null,
  }

  // 1) cria lead
  const { data: lead, error: leadErr } = await supabase.from('leads').insert(insertRow).select('*').single()
  if (leadErr) return { success: false, error: leadErr.message }

  // 2) cria negociação (property_negotiations) vinculada ao lead
  // Campos mínimos: property_id + lead_id (owner_user_id pode existir no schema; tentamos setar)
  const negotiationInsert: any = {
    property_id: propertyId,
    lead_id: lead.id,
    owner_user_id: userId, // se a coluna existir, ótimo; se não existir, veremos erro e ajustamos rápido
    created_by_profile_id: userId,
  }

  const { data: negotiation, error: negErr } = await supabase
    .from('property_negotiations')
    .insert(negotiationInsert)
    .select('id')
    .single()

  if (negErr) {
    const errorText = `${negErr.message ?? ''} ${negErr.details ?? ''} ${negErr.hint ?? ''}`
    const ownerColumnMissing =
      negErr.code === 'PGRST204' || negErr.code === '42703' || /owner_user_id/i.test(errorText)
    const createdByColumnMissing =
      negErr.code === 'PGRST204' || negErr.code === '42703' || /created_by_profile_id/i.test(errorText)

    if (!ownerColumnMissing && !createdByColumnMissing) return { success: false, error: negErr.message }

    const fallbackInsert: any = {
      property_id: propertyId,
      lead_id: lead.id,
    }
    if (!ownerColumnMissing) fallbackInsert.owner_user_id = userId
    if (!createdByColumnMissing) fallbackInsert.created_by_profile_id = userId

    const { data: negotiation2, error: negErr2 } = await supabase
      .from('property_negotiations')
      .insert(fallbackInsert)
      .select('id')
      .single()

    if (negErr2) return { success: false, error: negErr2.message }
    revalidatePath(`/properties/${propertyId}`)
    revalidatePath('/leads')
    return { success: true, lead: { ...lead, property_negotiation_id: negotiation2?.id ?? null } }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/leads')

  return { success: true, lead: { ...lead, property_negotiation_id: negotiation?.id ?? null } }
}
export async function createPersonQuickNegotiation(
  propertyId: string,
  payload: {
    full_name?: string | null
    email?: string | null
    phone_e164?: string | null
    value_estimate?: number | null
    title?: string | null
  }
): Promise<{ success: boolean; error?: string; person?: any; negotiation?: any }> {
  await requireActiveUser()
  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) return { success: false, error: 'Não autenticado' }
  const userId = userRes.user.id

  const full_name = payload.full_name?.trim() || null
  const email = payload.email?.trim() || null
  const phone_e164 = payload.phone_e164?.trim() || null

  // 1) Resolver Pessoa (buscar por email/telefone dentro do owner)
  let personId: string | null = null

  if (email || phone_e164) {
    const base = supabase
      .from('people')
      .select('id, full_name, email, phone_e164')
      .eq('owner_profile_id', userId)
      .limit(1)

    const { data: existing, error: findErr } = email
      ? await base.eq('email', email).maybeSingle()
      : await base.eq('phone_e164', phone_e164).maybeSingle()

    if (findErr) return { success: false, error: findErr.message }
    if (existing?.id) personId = existing.id
  }

  // 2) Criar Pessoa se não existir
  let personRow: any = null
  if (!personId) {
    const insertPerson: any = {
      owner_profile_id: userId,
      created_by_profile_id: userId,
      full_name,
      email,
      phone_e164,
    }

    Object.keys(insertPerson).forEach((k) => {
      if (insertPerson[k] === null || typeof insertPerson[k] === 'undefined') delete insertPerson[k]
    })

    const { data: created, error: personErr } = await supabase
      .from('people')
      .insert(insertPerson)
      .select('*')
      .single()

    if (personErr) return { success: false, error: personErr.message }
    personId = created.id
    personRow = created
  } else {
    const { data: loaded, error: loadErr } = await supabase
      .from('people')
      .select('*')
      .eq('id', personId)
      .single()
    if (loadErr) return { success: false, error: loadErr.message }
    personRow = loaded
  }

  // 3) Criar negociação (property_negotiations) vinculando Pessoa
  const negotiationInsert: any = {
    property_id: propertyId,
    person_id: personId,
    owner_user_id: userId, // se a coluna existir ok; se não existir, veremos erro e ajustamos
    created_by_profile_id: userId,
  }

  const { data: negotiation, error: negErr } = await supabase
    .from('property_negotiations')
    .insert(negotiationInsert)
    .select('*')
    .single()

  if (negErr) {
    const errorText = `${negErr.message ?? ''} ${negErr.details ?? ''} ${negErr.hint ?? ''}`
    const ownerColumnMissing =
      negErr.code === 'PGRST204' || negErr.code === '42703' || /owner_user_id/i.test(errorText)
    const createdByColumnMissing =
      negErr.code === 'PGRST204' || negErr.code === '42703' || /created_by_profile_id/i.test(errorText)

    if (!ownerColumnMissing && !createdByColumnMissing) return { success: false, error: negErr.message }

    const fallbackInsert: any = {
      property_id: propertyId,
      person_id: personId,
    }
    if (!ownerColumnMissing) fallbackInsert.owner_user_id = userId
    if (!createdByColumnMissing) fallbackInsert.created_by_profile_id = userId

    const { data: negotiation2, error: negErr2 } = await supabase
      .from('property_negotiations')
      .insert(fallbackInsert)
      .select('*')
      .single()

    if (negErr2) return { success: false, error: negErr2.message }

    revalidatePath(`/properties/${propertyId}`)
    revalidatePath('/people')

    return { success: true, person: personRow, negotiation: negotiation2 }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/people')

  return { success: true, person: personRow, negotiation }
}

export async function createPropertyNegotiation(
  propertyId: string,
  personId: string
): Promise<{ success: boolean; error?: string; negotiation?: any }> {
  await requireActiveUser()

  if (!propertyId || !personId) {
    return { success: false, error: 'Dados inválidos para criar a negociação.' }
  }

  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) return { success: false, error: 'Não autenticado' }
  const userId = userRes.user.id

  const insertRowWithOwner: any = {
    property_id: propertyId,
    person_id: personId,
    status: 'aberto',
    owner_user_id: userId,
    created_by_profile_id: userId,
  }

  Object.keys(insertRowWithOwner).forEach((k) => {
    if (insertRowWithOwner[k] === null || typeof insertRowWithOwner[k] === 'undefined') delete insertRowWithOwner[k]
  })

  const { data: negotiation, error } = await supabase
    .from('property_negotiations')
    .insert(insertRowWithOwner)
    .select('*')
    .single()

  if (error) {
    const errorText = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
    const ownerColumnMissing =
      error.code === 'PGRST204' || error.code === '42703' || /owner_user_id/i.test(errorText)

    if (!ownerColumnMissing) return { success: false, error: error.message }

    const insertRowLegacy: any = {
      property_id: propertyId,
      person_id: personId,
      status: 'aberto',
      created_by_profile_id: userId,
    }

    const { data: negotiationLegacy, error: legacyErr } = await supabase
      .from('property_negotiations')
      .insert(insertRowLegacy)
      .select('*')
      .single()

    if (legacyErr) return { success: false, error: legacyErr.message }

    revalidatePath(`/properties/${propertyId}`)

    return { success: true, negotiation: negotiationLegacy }
  }

  revalidatePath(`/properties/${propertyId}`)

  return { success: true, negotiation }
}
export type PropertyNegotiationRow = {
  id: string
  property_id: string
  person_id: string | null
  lead_id: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
  person_is_restricted: boolean
  proposal: {
    id: string
    status: string | null
    title: string | null
    description: string | null
    broker_seller_profile_id: string | null
    broker_buyer_profile_id: string | null
    sent_at: string | null
    updated_at: string | null
    created_at: string | null
    total_value: number | null
    counterparty_broker: {
      id: string
      full_name: string | null
      email: string | null
    } | null
  } | null
  person: {
    id: string
    full_name: string | null
    email: string | null
    phone_e164: string | null
  } | null
}

export async function getPropertyNegotiations(propertyId: string): Promise<PropertyNegotiationRow[]> {
  await requireActiveUser()

  if (!propertyId) throw new Error('Imóvel inválido.')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const actorId = user?.id ?? null
  const { data: actorProfile } = actorId
    ? await supabase.from('profiles').select('role').eq('id', actorId).maybeSingle()
    : { data: null }
  const isManager = actorProfile?.role === 'admin' || actorProfile?.role === 'gestor'

  const { data, error } = await supabase
    .from('property_negotiations')
    .select(
      `
      id,
      property_id,
      person_id,
      lead_id,
      status,
      created_at,
      updated_at,
      person:people (
        id,
        full_name,
        email,
        phone_e164,
        owner_profile_id
      )
    `
    )
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Erro ao carregar negociações.')

  // ⚠️ PostgREST às vezes retorna relação como array.
  // Aqui normalizamos pra SEMPRE ser objeto ou null.
  const rows = (data ?? []) as any[]
  const negotiationIds = rows.map((r) => String(r.id)).filter(Boolean)

  type ProposalLite = {
    id: string
    negotiation_id: string
    status: string | null
    title: string | null
    description: string | null
    sent_at: string | null
    updated_at: string | null
    created_at: string | null
    commission_value: number | null
    broker_seller_profile_id: string | null
    broker_buyer_profile_id: string | null
  }

  const proposalByNegotiationId = new Map<string, ProposalLite>()
  const proposalTotalById = new Map<string, number>()
  const profileById = new Map<string, { id: string; full_name: string | null; email: string | null }>()

  const scoreProposalTs = (proposal: ProposalLite) => {
    const ts = Date.parse(String(proposal.updated_at ?? proposal.sent_at ?? proposal.created_at ?? ''))
    return Number.isFinite(ts) ? ts : 0
  }

  if (negotiationIds.length > 0) {
    const { data: proposalRows, error: proposalErr } = await supabase
      .from('property_proposals')
      .select(
        `
        id,
        negotiation_id,
        status,
        title,
        description,
        sent_at,
        updated_at,
        created_at,
        commission_value,
        broker_seller_profile_id,
        broker_buyer_profile_id
      `
      )
      .in('negotiation_id', negotiationIds)

    if (!proposalErr) {
      const proposals = (proposalRows ?? []) as ProposalLite[]

      for (const proposal of proposals) {
        const current = proposalByNegotiationId.get(proposal.negotiation_id)
        if (!current || scoreProposalTs(proposal) >= scoreProposalTs(current)) {
          proposalByNegotiationId.set(proposal.negotiation_id, proposal)
        }
      }

      const selectedProposals = Array.from(proposalByNegotiationId.values())
      const selectedProposalIds = selectedProposals.map((proposal) => proposal.id).filter(Boolean)

      if (selectedProposalIds.length > 0) {
        const { data: paymentRows, error: paymentErr } = await supabase
          .from('property_proposal_payments')
          .select('proposal_id, amount')
          .in('proposal_id', selectedProposalIds)

        if (!paymentErr) {
          for (const payment of (paymentRows ?? []) as Array<{ proposal_id: string; amount: number | null }>) {
            const amount = Number(payment.amount ?? 0)
            if (!Number.isFinite(amount)) continue
            proposalTotalById.set(payment.proposal_id, (proposalTotalById.get(payment.proposal_id) ?? 0) + amount)
          }
        }
      }

      const brokerIds = Array.from(
        new Set(
          selectedProposals
            .flatMap((proposal) => [proposal.broker_seller_profile_id, proposal.broker_buyer_profile_id])
            .filter((value): value is string => !!value)
        )
      )

      if (brokerIds.length > 0) {
        const { data: profileRows, error: profileErr } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', brokerIds)

        if (!profileErr) {
          for (const profile of (profileRows ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
            profileById.set(profile.id, profile)
          }
        }
      }
    }
  }

  return rows.map((r) => {
    const rawPerson = r.person
    const person =
      Array.isArray(rawPerson)
        ? rawPerson[0] ?? null
        : rawPerson ?? null
    const personOwnerProfileId =
      person?.owner_profile_id !== undefined && person?.owner_profile_id !== null
        ? String(person.owner_profile_id)
        : null
    const isRestrictedPerson = !!person && !isManager && (!actorId || !personOwnerProfileId || personOwnerProfileId !== actorId)
    const proposal = proposalByNegotiationId.get(r.id) ?? null
    const proposalTotal = proposal ? proposalTotalById.get(proposal.id) ?? null : null
    const fallbackTotal = Number(proposal?.commission_value ?? 0)
    const totalValue =
      proposalTotal !== null
        ? proposalTotal
        : Number.isFinite(fallbackTotal)
        ? fallbackTotal
        : null

    const counterpartyId = proposal
      ? actorId && proposal.broker_seller_profile_id === actorId
        ? proposal.broker_buyer_profile_id
        : actorId && proposal.broker_buyer_profile_id === actorId
        ? proposal.broker_seller_profile_id
        : proposal.broker_seller_profile_id ?? proposal.broker_buyer_profile_id
      : null

    const counterpartyProfile = counterpartyId ? profileById.get(counterpartyId) ?? null : null

    return {
      id: r.id,
      property_id: r.property_id,
      person_id: r.person_id ?? null,
      lead_id: r.lead_id ?? null,
      status: r.status ?? null,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
      person_is_restricted: isRestrictedPerson,
      proposal: proposal
        ? {
            id: proposal.id,
            status: proposal.status ?? null,
            title: proposal.title ?? null,
            description: proposal.description ?? null,
            broker_seller_profile_id: proposal.broker_seller_profile_id ?? null,
            broker_buyer_profile_id: proposal.broker_buyer_profile_id ?? null,
            sent_at: proposal.sent_at ?? null,
            updated_at: proposal.updated_at ?? null,
            created_at: proposal.created_at ?? null,
            total_value: totalValue,
            counterparty_broker: counterpartyId
              ? {
                  id: counterpartyId,
                  full_name: counterpartyProfile?.full_name ?? null,
                  email: counterpartyProfile?.email ?? null,
                }
              : null,
          }
        : null,
      person: person
        ? {
            id: person.id,
            full_name: isRestrictedPerson ? null : person.full_name ?? null,
            email: isRestrictedPerson ? null : person.email ?? null,
            phone_e164: isRestrictedPerson ? null : person.phone_e164 ?? null,
          }
        : null,
    } satisfies PropertyNegotiationRow
  })
}

type ProposalRow = {
  id: string
  negotiation_id: string
  property_id: string | null
  person_id: string | null
  status: string | null
  requires_manager_approval: boolean | null
  approved_by_profile_id: string | null
  approved_at: string | null
  sent_at: string | null
  opened_at: string | null
  commission_percent: number | null
  commission_value: number | null
  base_value: number | null
  owner_net_value: number | null
  broker_split_percent: number | null
  broker_commission_value: number | null
  partner_split_percent: number | null
  partner_commission_value: number | null
  company_commission_value: number | null
  commission_modality: string | null
  broker_seller_profile_id: string | null
  broker_buyer_profile_id: string | null
  title: string | null
  description: string | null
  created_by_profile_id: string | null
  created_at: string | null
  updated_at: string | null
}

type ProposalVersionRow = {
  id: string
  proposal_id: string
  version_number: number
  snapshot: unknown
  created_by_profile_id: string | null
  created_at: string
}

type ProposalPaymentRow = {
  id: string
  proposal_id: string
  method: string
  amount: number
  due_date: string | null
  details: string | null
  created_at: string
}

type ProposalInstallmentRow = {
  id: string
  proposal_payment_id: string
  installment_no: number
  amount: number
  due_date: string
  note: string | null
  created_at: string
}

export async function getProposalBundleByNegotiation(negotiationId: string) {
  await requireActiveUser()

  if (!negotiationId) {
    throw new Error('Negociação inválida.')
  }

  const supabase = await createClient()

  const { data: proposal, error: proposalErr } = await supabase
    .from('property_proposals')
    .select('*')
    .eq('negotiation_id', negotiationId)
    .limit(1)
    .maybeSingle()

  if (proposalErr) {
    throw new Error(proposalErr.message || 'Erro ao carregar proposta.')
  }

  if (!proposal) {
    return {
      proposal: null,
      latestVersion: null,
      payments: [] as ProposalPaymentRow[],
      installments: [] as ProposalInstallmentRow[],
    }
  }

  const [{ data: latestVersion, error: versionErr }, { data: payments, error: paymentsErr }] = await Promise.all([
    supabase
      .from('property_proposal_versions')
      .select('*')
      .eq('proposal_id', proposal.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('property_proposal_payments')
      .select('*')
      .eq('proposal_id', proposal.id)
      .order('created_at', { ascending: true }),
  ])

  if (versionErr) {
    throw new Error(versionErr.message || 'Erro ao carregar versão da proposta.')
  }

  if (paymentsErr) {
    throw new Error(paymentsErr.message || 'Erro ao carregar pagamentos da proposta.')
  }

  const paymentIds = (payments ?? []).map((p: any) => p.id).filter(Boolean)

  let installments: ProposalInstallmentRow[] = []
  if (paymentIds.length > 0) {
    const { data: installmentRows, error: installmentsErr } = await supabase
      .from('property_proposal_installments')
      .select('*')
      .in('proposal_payment_id', paymentIds)
      .order('installment_no', { ascending: true })

    if (installmentsErr) {
      throw new Error(installmentsErr.message || 'Erro ao carregar parcelas da proposta.')
    }

    installments = (installmentRows ?? []) as ProposalInstallmentRow[]
  }

  return {
    proposal: proposal as ProposalRow,
    latestVersion: (latestVersion ?? null) as ProposalVersionRow | null,
    payments: (payments ?? []) as ProposalPaymentRow[],
    installments,
  }
}

export type SaveProposalDraftBundleInput = {
  negotiationId: string
  title?: string | null
  description?: string | null
  commission_percent?: number | null
  commission_value?: number | null
  base_value?: number | null
  owner_net_value?: number | null
  broker_split_percent?: number | null
  broker_commission_value?: number | null
  partner_split_percent?: number | null
  partner_commission_value?: number | null
  company_commission_value?: number | null
  commission_modality?: string | null
  payments: Array<{
    method: string
    amount: number
    due_date?: string | null
    details?: string | null
  }>
  installments: Array<{
    method: string
    installment_no: number
    amount: number
    due_date: string
    note?: string | null
  }>
}

export async function saveProposalDraftBundle(input: SaveProposalDraftBundleInput) {
  await requireActiveUser()

  if (!input?.negotiationId) {
    return { success: false as const, error: 'Negociação inválida.' }
  }

  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false as const, error: 'Não autenticado.' }
  }
  const actor = userRes.user.id

  const { data: negotiation, error: negotiationErr } = await supabase
    .from('property_negotiations')
    .select('id, property_id, person_id, created_by_profile_id')
    .eq('id', input.negotiationId)
    .maybeSingle()

  if (negotiationErr || !negotiation) {
    return { success: false as const, error: 'Negociação não encontrada.' }
  }

  const [{ data: actorProfile }, { data: propertyOwner }, { data: personOwner }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', actor).maybeSingle(),
    negotiation.property_id
      ? supabase.from('properties').select('owner_user_id').eq('id', negotiation.property_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    negotiation.person_id
      ? supabase.from('people').select('owner_profile_id').eq('id', negotiation.person_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
  ])

  const isManager = actorProfile?.role === 'admin' || actorProfile?.role === 'gestor'
  const propertyOwnerUserId = propertyOwner?.owner_user_id ?? null
  const isPropertyOwner = propertyOwnerUserId === actor
  const isNegotiationCreator = (negotiation as any)?.created_by_profile_id === actor
  const isPersonOwner = personOwner?.owner_profile_id === actor
  const canCreateOrEditProposal = isManager || isPropertyOwner || isNegotiationCreator || isPersonOwner

  const { data: existingProposal, error: proposalErr } = await supabase
    .from('property_proposals')
    .select('*')
    .eq('negotiation_id', input.negotiationId)
    .limit(1)
    .maybeSingle()

  if (proposalErr) {
    return { success: false as const, error: proposalErr.message || 'Erro ao buscar proposta.' }
  }

  const now = new Date().toISOString()
  const title = input.title?.trim() || 'Proposta'
  const description = input.description?.trim() || ''
  const commissionPercent =
    typeof input.commission_percent === 'number' && Number.isFinite(input.commission_percent)
      ? input.commission_percent
      : null
  const commissionValue =
    typeof input.commission_value === 'number' && Number.isFinite(input.commission_value) ? input.commission_value : null
  const baseValue = typeof input.base_value === 'number' && Number.isFinite(input.base_value) ? input.base_value : null
  const ownerNetValue =
    typeof input.owner_net_value === 'number' && Number.isFinite(input.owner_net_value) ? input.owner_net_value : null
  const brokerSplitPercent =
    typeof input.broker_split_percent === 'number' && Number.isFinite(input.broker_split_percent)
      ? input.broker_split_percent
      : null
  const brokerCommissionValue =
    typeof input.broker_commission_value === 'number' && Number.isFinite(input.broker_commission_value)
      ? input.broker_commission_value
      : null
  const partnerSplitPercent =
    typeof input.partner_split_percent === 'number' && Number.isFinite(input.partner_split_percent)
      ? input.partner_split_percent
      : null
  const partnerCommissionValue =
    typeof input.partner_commission_value === 'number' && Number.isFinite(input.partner_commission_value)
      ? input.partner_commission_value
      : null
  const companyCommissionValue =
    typeof input.company_commission_value === 'number' && Number.isFinite(input.company_commission_value)
      ? input.company_commission_value
      : null
  const commissionModality = typeof input.commission_modality === 'string' ? input.commission_modality.trim() || null : null

  let proposalId = existingProposal?.id as string | undefined

  if (!existingProposal) {
    if (!canCreateOrEditProposal) {
      return { success: false as const, error: 'Sem permissão para criar proposta nesta negociação.' }
    }

    const { data: createdProposal, error: createErr } = await supabase
      .from('property_proposals')
      .insert({
        negotiation_id: input.negotiationId,
        property_id: (negotiation as any).property_id ?? null,
        person_id: (negotiation as any).person_id ?? null,
        status: 'draft',
        broker_seller_profile_id: propertyOwnerUserId,
        broker_buyer_profile_id: actor,
        title,
        description,
        commission_percent: commissionPercent,
        commission_value: commissionValue,
        base_value: baseValue,
        owner_net_value: ownerNetValue,
        broker_split_percent: brokerSplitPercent,
        broker_commission_value: brokerCommissionValue,
        partner_split_percent: partnerSplitPercent,
        partner_commission_value: partnerCommissionValue,
        company_commission_value: companyCommissionValue,
        commission_modality: commissionModality,
        created_by_profile_id: actor,
        updated_at: now,
      })
      .select('id')
      .single()

    if (createErr || !createdProposal) {
      return { success: false as const, error: createErr?.message || 'Erro ao criar proposta.' }
    }

    proposalId = createdProposal.id
  } else {
    const isCreator = existingProposal.created_by_profile_id === actor
    if (!canCreateOrEditProposal && !isCreator) {
      return { success: false as const, error: 'Sem permissão para editar esta proposta.' }
    }

    if (existingProposal.status !== 'draft') {
      return { success: false as const, error: 'Proposta travada' }
    }

    const { error: updateErr } = await supabase
      .from('property_proposals')
      .update({
        broker_seller_profile_id: existingProposal.broker_seller_profile_id ?? propertyOwnerUserId,
        broker_buyer_profile_id: existingProposal.broker_buyer_profile_id ?? actor,
        title,
        description,
        commission_percent: commissionPercent,
        commission_value: commissionValue,
        base_value: baseValue,
        owner_net_value: ownerNetValue,
        broker_split_percent: brokerSplitPercent,
        broker_commission_value: brokerCommissionValue,
        partner_split_percent: partnerSplitPercent,
        partner_commission_value: partnerCommissionValue,
        company_commission_value: companyCommissionValue,
        commission_modality: commissionModality,
        updated_at: now,
      })
      .eq('id', existingProposal.id)

    if (updateErr) {
      return { success: false as const, error: updateErr.message || 'Erro ao atualizar proposta.' }
    }
  }

  if (!proposalId) {
    return { success: false as const, error: 'Falha ao resolver proposta.' }
  }

  const { data: existingPayments } = await supabase
    .from('property_proposal_payments')
    .select('id')
    .eq('proposal_id', proposalId)

  const oldPaymentIds = (existingPayments ?? []).map((row: any) => row.id).filter(Boolean)
  if (oldPaymentIds.length > 0) {
    const { error: deleteInstallmentsErr } = await supabase
      .from('property_proposal_installments')
      .delete()
      .in('proposal_payment_id', oldPaymentIds)

    if (deleteInstallmentsErr) {
      return { success: false as const, error: deleteInstallmentsErr.message || 'Erro ao limpar parcelas antigas.' }
    }
  }

  const { error: deletePaymentsErr } = await supabase.from('property_proposal_payments').delete().eq('proposal_id', proposalId)

  if (deletePaymentsErr) {
    return { success: false as const, error: deletePaymentsErr.message || 'Erro ao limpar pagamentos.' }
  }

  const paymentsInput = Array.isArray(input.payments) ? input.payments : []
  const rowsToInsert = paymentsInput.map((payment) => ({
    proposal_id: proposalId,
    method: String(payment.method || '').trim(),
    amount: Number.isFinite(Number(payment.amount)) ? Number(payment.amount) : 0,
    due_date: payment.due_date ?? null,
    details: payment.details ?? null,
  }))

  let createdPayments: Array<{ id: string; method: string }> = []
  if (rowsToInsert.length > 0) {
    const { data: insertedPayments, error: insertPaymentsErr } = await supabase
      .from('property_proposal_payments')
      .insert(rowsToInsert)
      .select('id, method')

    if (insertPaymentsErr) {
      return { success: false as const, error: insertPaymentsErr.message || 'Erro ao inserir pagamentos.' }
    }

    createdPayments = (insertedPayments ?? []) as Array<{ id: string; method: string }>
  }

  const paymentByMethod = new Map<string, string>()
  for (const p of createdPayments) {
    if (!p?.method || !p?.id) continue
    if (!paymentByMethod.has(p.method)) {
      paymentByMethod.set(p.method, p.id)
    }
  }

  const installmentsInput = Array.isArray(input.installments) ? input.installments : []
  if (installmentsInput.length > 0) {
    const installmentRows: Array<{
      proposal_payment_id: string
      installment_no: number
      amount: number
      due_date: string
      note: string | null
    }> = []

    for (const inst of installmentsInput) {
      const paymentId = paymentByMethod.get(inst.method)
      if (!paymentId) {
        return { success: false as const, error: `Pagamento para método "${inst.method}" não encontrado.` }
      }
      if (!inst.due_date) {
        return { success: false as const, error: 'Parcela sem vencimento.' }
      }

      installmentRows.push({
        proposal_payment_id: paymentId,
        installment_no: Number.isFinite(Number(inst.installment_no)) ? Number(inst.installment_no) : 1,
        amount: Number.isFinite(Number(inst.amount)) ? Number(inst.amount) : 0,
        due_date: inst.due_date,
        note: inst.note?.trim() || null,
      })
    }

    if (installmentRows.length > 0) {
      const { error: installmentsErr } = await supabase.from('property_proposal_installments').insert(installmentRows)
      if (installmentsErr) {
        return { success: false as const, error: installmentsErr.message || 'Erro ao inserir parcelas.' }
      }
    }
  }

  revalidatePath(`/properties/${(negotiation as any).property_id}`)

  return { success: true as const, proposalId }
}

export type ProposalTransitionInput = {
  proposalId: string
  action: 'submit_review' | 'submit_counterproposal' | 'back_to_draft' | 'approve' | 'reject'
  note?: string | null
}

const PROPOSAL_ALLOWED_TRANSITIONS: Record<
  ProposalTransitionInput['action'],
  Array<'draft' | 'in_review' | 'counterproposal' | 'approved' | 'rejected'>
> = {
  submit_review: ['draft', 'counterproposal'],
  submit_counterproposal: ['draft', 'in_review'],
  back_to_draft: ['in_review', 'counterproposal', 'rejected'],
  approve: ['in_review', 'counterproposal'],
  reject: ['in_review', 'counterproposal'],
}

export async function transitionProposalStatus(input: ProposalTransitionInput) {
  await requireActiveUser()

  if (!input?.proposalId) {
    return { success: false as const, error: 'Proposta inválida.' }
  }

  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false as const, error: 'Não autenticado.' }
  }
  const actor = userRes.user.id

  const { data: proposal, error: proposalErr } = await supabase
    .from('property_proposals')
    .select('*')
    .eq('id', input.proposalId)
    .maybeSingle()

  if (proposalErr || !proposal) {
    return { success: false as const, error: 'Proposta não encontrada.' }
  }

  let actorRole: string | null = null
  if (input.action === 'back_to_draft' || input.action === 'approve' || input.action === 'reject') {
    const { data: profile, error: profileErr } = await supabase.from('profiles').select('role').eq('id', actor).maybeSingle()
    if (profileErr) {
      return { success: false as const, error: profileErr.message || 'Erro ao validar perfil.' }
    }
    actorRole = profile?.role ?? null
  }

  const { data: proposalProperty } = proposal.property_id
    ? await supabase.from('properties').select('owner_user_id').eq('id', proposal.property_id).maybeSingle()
    : ({ data: null } as any)

  const isManager = actorRole === 'admin' || actorRole === 'gestor'
  const isCreator = proposal.created_by_profile_id === actor
  const isPropertyOwner = proposalProperty?.owner_user_id === actor
  const canManageProposal = isManager || isCreator || isPropertyOwner
  const sellerBrokerId = proposal.broker_seller_profile_id ?? proposalProperty?.owner_user_id ?? null
  const buyerBrokerId =
    proposal.broker_buyer_profile_id ?? proposal.created_by_profile_id ?? proposalProperty?.owner_user_id ?? null
  const currentStatus = String(proposal.status ?? 'draft') as
    | 'draft'
    | 'in_review'
    | 'counterproposal'
    | 'approved'
    | 'rejected'

  const allowedFrom = PROPOSAL_ALLOWED_TRANSITIONS[input.action] ?? []
  if (!allowedFrom.includes(currentStatus)) {
    return {
      success: false as const,
      error: `Transição inválida: ação "${input.action}" não permitida para status "${currentStatus}".`,
    }
  }

  if (input.action === 'submit_review' || input.action === 'submit_counterproposal') {
    if (!canManageProposal) {
      return { success: false as const, error: 'Sem permissão para alterar esta proposta.' }
    }

    const [{ data: payments, error: paymentsErr }, { data: lastVersion }] = await Promise.all([
      supabase
        .from('property_proposal_payments')
        .select('*')
        .eq('proposal_id', proposal.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('property_proposal_versions')
        .select('version_number')
        .eq('proposal_id', proposal.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (paymentsErr) {
      return { success: false as const, error: paymentsErr.message || 'Erro ao carregar pagamentos.' }
    }

    const paymentIds = (payments ?? []).map((p: any) => p.id).filter(Boolean)
    let installments: any[] = []
    if (paymentIds.length > 0) {
      const { data: installmentRows, error: installmentsErr } = await supabase
        .from('property_proposal_installments')
        .select('*')
        .in('proposal_payment_id', paymentIds)
        .order('installment_no', { ascending: true })

      if (installmentsErr) {
        return { success: false as const, error: installmentsErr.message || 'Erro ao carregar parcelas.' }
      }
      installments = installmentRows ?? []
    }

    const nextVersion = Number(lastVersion?.version_number ?? 0) + 1
    const now = new Date().toISOString()
    const snapshot = {
      note: input.note ?? null,
      at: now,
      status_from: proposal.status,
      action: input.action,
      proposal,
      payments: payments ?? [],
      installments,
    }

    const { error: versionErr } = await supabase.from('property_proposal_versions').insert({
      proposal_id: proposal.id,
      version_number: nextVersion,
      snapshot,
      created_by_profile_id: actor,
    })

    if (versionErr) {
      return { success: false as const, error: versionErr.message || 'Erro ao versionar proposta.' }
    }

    const nextStatus = input.action === 'submit_review' ? 'in_review' : 'counterproposal'
    const { error: statusErr } = await supabase
      .from('property_proposals')
      .update({
        status: nextStatus,
        sent_at: now,
        updated_at: now,
      })
      .eq('id', proposal.id)

    if (statusErr) {
      return { success: false as const, error: statusErr.message || 'Erro ao atualizar status da proposta.' }
    }

    return { success: true as const }
  }

  if (input.action === 'back_to_draft') {
    if (!canManageProposal) {
      return { success: false as const, error: 'Sem permissão para voltar para rascunho.' }
    }

    const { error: updateErr } = await supabase
      .from('property_proposals')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', proposal.id)

    if (updateErr) {
      return { success: false as const, error: updateErr.message || 'Erro ao voltar proposta para rascunho.' }
    }

    return { success: true as const }
  }

  if (input.action === 'approve') {
    const isDecisionForSeller = currentStatus === 'in_review'
    const isDecisionForBuyer = currentStatus === 'counterproposal'
    const isExpectedApprover =
      (isDecisionForSeller && sellerBrokerId === actor) || (isDecisionForBuyer && buyerBrokerId === actor)

    if (!isManager && !isExpectedApprover) {
      return { success: false as const, error: 'Sem permissão para aprovar proposta.' }
    }

    const now = new Date().toISOString()
    const { error: approveErr } = await supabase
      .from('property_proposals')
      .update({
        status: 'approved',
        approved_by_profile_id: actor,
        approved_at: now,
        updated_at: now,
      })
      .eq('id', proposal.id)

    if (approveErr) {
      return { success: false as const, error: approveErr.message || 'Erro ao aprovar proposta.' }
    }

    // TODO: gerar PDF da proposta aprovada.
    return { success: true as const }
  }

  if (input.action === 'reject') {
    const isDecisionForSeller = currentStatus === 'in_review'
    const isDecisionForBuyer = currentStatus === 'counterproposal'
    const isExpectedApprover =
      (isDecisionForSeller && sellerBrokerId === actor) || (isDecisionForBuyer && buyerBrokerId === actor)

    if (!isManager && !isExpectedApprover) {
      return { success: false as const, error: 'Sem permissão para rejeitar proposta.' }
    }

    const { error: rejectErr } = await supabase
      .from('property_proposals')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)

    if (rejectErr) {
      return { success: false as const, error: rejectErr.message || 'Erro ao rejeitar proposta.' }
    }

    return { success: true as const }
  }

  return { success: false as const, error: 'Ação inválida.' }
}

