'use server'

import { createClient } from '@/lib/supabaseServer'
import { revalidatePath } from 'next/cache'
import { hasValidatedAuthorizationDoc } from './publish-guard'
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
        'Para publicar o imóvel, anexe e valide o Termo de Autorização do proprietário em “Imóveis → Documentos”.',
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
      .order('group', { ascending: true })
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
  area_m2?: number | string | null
  bedrooms?: number | string | null
  bathrooms?: number | string | null
  parking?: number | string | null
  suites?: number | string | null
  condo_fee?: number | string | null
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
  await requireActiveUser()

  if (!propertyId) {
    throw new Error('Imóvel inválido.')
  }

  const supabase = await createClient()

  if (payload.owner_client_id === '') {
    payload.owner_client_id = null
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
      .contains('kind_tags', ['proprietario'])
      .order('updated_at', { ascending: false })
      .limit(50)

    const { data, error } = term
      ? await baseQuery.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,document_id.ilike.%${term}%`)
      : await baseQuery

    if (error) {
      return { ok: false, error: error.message || 'Erro ao buscar proprietários.' }
    }

    return { ok: true, data: (data ?? []) as PersonSearchRow[] }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro inesperado ao buscar proprietários.' }
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
  }

  const { data: negotiation, error: negErr } = await supabase
    .from('property_negotiations')
    .insert(negotiationInsert)
    .select('id')
    .single()

  if (negErr) {
    // fallback: tenta sem owner_user_id (caso a coluna não exista)
    const { data: negotiation2, error: negErr2 } = await supabase
      .from('property_negotiations')
      .insert({ property_id: propertyId, lead_id: lead.id })
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
      .eq('owner_user_id', userId)
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
      owner_user_id: userId,
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
  }

  const { data: negotiation, error: negErr } = await supabase
    .from('property_negotiations')
    .insert(negotiationInsert)
    .select('*')
    .single()

  if (negErr) {
    // fallback caso property_negotiations não tenha owner_user_id
    const { data: negotiation2, error: negErr2 } = await supabase
      .from('property_negotiations')
      .insert({ property_id: propertyId, person_id: personId })
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

  const insertRow: any = {
    property_id: propertyId,
    person_id: personId,
    status: 'aberto',
    created_by_profile_id: userId,
  }

  Object.keys(insertRow).forEach((k) => {
    if (insertRow[k] === null || typeof insertRow[k] === 'undefined') delete insertRow[k]
  })

  const { data: negotiation, error } = await supabase
    .from('property_negotiations')
    .insert(insertRow)
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }

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
        phone_e164
      )
    `
    )
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Erro ao carregar negociações.')

  // ⚠️ PostgREST às vezes retorna relação como array.
  // Aqui normalizamos pra SEMPRE ser objeto ou null.
  const rows = (data ?? []) as any[]

  return rows.map((r) => {
    const rawPerson = r.person
    const person =
      Array.isArray(rawPerson)
        ? rawPerson[0] ?? null
        : rawPerson ?? null

    return {
      id: r.id,
      property_id: r.property_id,
      person_id: r.person_id ?? null,
      lead_id: r.lead_id ?? null,
      status: r.status ?? null,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
      person: person
        ? {
            id: person.id,
            full_name: person.full_name ?? null,
            email: person.email ?? null,
            phone_e164: person.phone_e164 ?? null,
          }
        : null,
    } satisfies PropertyNegotiationRow
  })
}
