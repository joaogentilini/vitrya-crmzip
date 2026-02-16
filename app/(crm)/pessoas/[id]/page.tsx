import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabaseServer'
import { requireActiveUser } from '@/lib/auth'
import PessoasTabsClient, { type PersonRecord } from './PessoasTabsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PessoaPage({ params }: PageProps) {
  const { id } = await params
  
  // ✅ padroniza auth (evita variações entre pages)
  await requireActiveUser()

  const supabase = await createClient()

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (userError || !user) notFound()

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const currentUserRole = currentProfile?.role ?? null

  // ✅ pessoa + perfis PF/PJ (fonte de CPF/RG e CNPJ)
  const { data: person, error: personError } = await supabase
    .from('people')
    .select(
      `*,
      person_financing_profiles:person_financing_profiles(
        cpf,
        rg,
        rg_issuing_org,
        marital_status,
        birth_date,
        profession,
        education_level,
        nationality,
        mother_name,
        property_regime
      ),
      person_company_profiles:person_company_profiles(
        cnpj,
        legal_name,
        trade_name,
        state_registration,
        municipal_registration
      )`
    )
    .eq('id', id)
    .single()

  if (personError || !person) notFound()

  const assignedProfileId = (person as any).assigned_to ?? (person as any).owner_profile_id ?? null

  const creatorProfilePromise = person.created_by_profile_id
    ? supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', person.created_by_profile_id)
        .maybeSingle()
    : Promise.resolve({ data: null as any, error: null as any })

  const assignedProfilePromise = assignedProfileId
    ? supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', assignedProfileId)
        .maybeSingle()
    : Promise.resolve({ data: null as any, error: null as any })

  const [creatorProfileRes, assignedProfileRes] = await Promise.all([
    creatorProfilePromise,
    assignedProfilePromise
  ])

  const shouldLoadBrokers = currentUserRole === 'admin' || currentUserRole === 'gestor'

  const [
    linksRes,
    timelineRes,
    documentsRes,
    leadsRes,
    brokersRes,
    addressesRes,
    incomeSourcesRes,
    liabilitiesRes,
    bankAccountsRes,
    householdMembersRes,
    propertiesRes
  ] = await Promise.all([
    supabase
      .from('person_links')
      .select('*')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('person_timeline_events')
      .select('*')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('person_documents')
      .select('*')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('leads')
      .select('id, title, status, pipeline_id, stage_id, created_at, assigned_to')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    shouldLoadBrokers
      ? supabase.from('v_public_brokers').select('*').order('full_name', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('person_addresses')
      .select('*')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('person_income_sources')
      .select('*')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('person_liabilities')
      .select('*')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('person_bank_accounts')
      .select('*')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('person_household_members')
      .select('*, member:member_person_id(id, full_name, email, phone_e164)')
      .eq('primary_person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('properties')
      .select('id, title, status, city, neighborhood, price, rent_price, purpose, created_at')
      .eq('owner_client_id', id)
      .order('created_at', { ascending: false })
  ])

  // ✅ normaliza retorno (às vezes vem array, às vezes objeto)
  const financingProfile = Array.isArray((person as any).person_financing_profiles)
    ? (person as any).person_financing_profiles[0] ?? null
    : (person as any).person_financing_profiles ?? null

  const companyProfile = Array.isArray((person as any).person_company_profiles)
    ? (person as any).person_company_profiles[0] ?? null
    : (person as any).person_company_profiles ?? null

  const ownedProperties = (propertiesRes.data as Record<string, unknown>[]) ?? []
  const ownedPropertyIds = ownedProperties.map((row) => row.id).filter(Boolean) as string[]

  const buyerLeadsQuery = supabase
    .from('leads')
    .select('id, title, status, property_id, budget_range, created_at')
    .eq('person_id', id)
    .order('created_at', { ascending: false })

  const ownerLeadsQuery =
    ownedPropertyIds.length > 0
      ? supabase
          .from('leads')
          .select('id, title, status, property_id, budget_range, created_at')
          .in('property_id', ownedPropertyIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null })

  const [buyerLeadsRes, ownerLeadsRes] = await Promise.all([buyerLeadsQuery, ownerLeadsQuery])

  const leadMap = new Map<string, Record<string, unknown>>()
  const buyerLeads = buyerLeadsRes.error ? [] : (buyerLeadsRes.data as Record<string, unknown>[]) ?? []
  const ownerLeads = ownerLeadsRes.error ? [] : (ownerLeadsRes.data as Record<string, unknown>[]) ?? []
  for (const row of buyerLeads) {
    if (row?.id) leadMap.set(String(row.id), row)
  }
  for (const row of ownerLeads) {
    if (row?.id) leadMap.set(String(row.id), row)
  }

  const negotiationsRaw = Array.from(leadMap.values())
  const negotiationPropertyIds = negotiationsRaw
    .map((row) => row.property_id)
    .filter(Boolean) as string[]

  const negotiationPropertyIdsUnique = Array.from(new Set(negotiationPropertyIds))

  const negotiationPropertiesRes =
    negotiationPropertyIdsUnique.length > 0
      ? await supabase
          .from('properties')
          .select('id, title, city, neighborhood')
          .in('id', negotiationPropertyIdsUnique)
      : { data: [], error: null }

  const negotiationPropertyMap = new Map<string, Record<string, unknown>>(
    ((negotiationPropertiesRes.data as Record<string, unknown>[]) ?? []).map((row) => [
      String(row.id),
      row
    ])
  )

  const negotiations = negotiationsRaw.map((row) => {
    const propertyId = row.property_id as string | null
    return {
      ...row,
      property: propertyId ? negotiationPropertyMap.get(propertyId) ?? null : null,
      property_title: propertyId ? negotiationPropertyMap.get(propertyId)?.title ?? null : null
    }
  })

  const personForClient = {
    ...(person as Record<string, unknown>),
    assigned_to: assignedProfileId
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Link href="/pessoas" className="hover:text-[var(--foreground)] transition-colors">
          Pessoas
        </Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">{person.full_name || 'Pessoa'}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {person.full_name || 'Pessoa'}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">Visualização em modo leitura.</p>
      </div>

      <PessoasTabsClient
        person={personForClient as unknown as PersonRecord}
        creatorProfile={creatorProfileRes.data}
        assignedProfile={assignedProfileRes.data}
        currentUserRole={currentUserRole}
        brokers={(brokersRes.data as Record<string, unknown>[]) ?? []}
        properties={ownedProperties}
        negotiations={negotiations}
        links={(linksRes.data as Record<string, unknown>[]) ?? []}
        timeline={(timelineRes.data as Record<string, unknown>[]) ?? []}
        documents={(documentsRes.data as Record<string, unknown>[]) ?? []}
        relatedLeads={(leadsRes.data as Record<string, unknown>[]) ?? []}
        financingProfile={(financingProfile as Record<string, unknown> | null) ?? null}
        companyProfile={(companyProfile as Record<string, unknown> | null) ?? null}
        addresses={(addressesRes.data as Record<string, unknown>[]) ?? []}
        incomeSources={(incomeSourcesRes.data as Record<string, unknown>[]) ?? []}
        liabilities={(liabilitiesRes.data as Record<string, unknown>[]) ?? []}
        bankAccounts={(bankAccountsRes.data as Record<string, unknown>[]) ?? []}
        householdMembers={(householdMembersRes.data as Record<string, unknown>[]) ?? []}
        errors={{
          links: linksRes.error?.message ?? null,
          timeline: timelineRes.error?.message ?? null,
          documents: documentsRes.error?.message ?? null
        }}
      />
    </main>
  )
}
