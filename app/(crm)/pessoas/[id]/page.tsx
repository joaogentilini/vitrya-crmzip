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
  const ownedPropertyIdSet = new Set(ownedPropertyIds)

  const buyerNegotiationsQuery = supabase
    .from('property_negotiations')
    .select('id, property_id, person_id, lead_id, status, created_at, updated_at')
    .eq('person_id', id)
    .order('created_at', { ascending: false })

  const ownerNegotiationsQuery =
    ownedPropertyIds.length > 0
      ? supabase
          .from('property_negotiations')
          .select('id, property_id, person_id, lead_id, status, created_at, updated_at')
          .in('property_id', ownedPropertyIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null })

  const [buyerNegotiationsRes, ownerNegotiationsRes] = await Promise.all([
    buyerNegotiationsQuery,
    ownerNegotiationsQuery
  ])

  const negotiationMap = new Map<string, Record<string, unknown>>()
  const buyerNegotiations = buyerNegotiationsRes.error
    ? []
    : (buyerNegotiationsRes.data as Record<string, unknown>[]) ?? []
  const ownerNegotiations = ownerNegotiationsRes.error
    ? []
    : (ownerNegotiationsRes.data as Record<string, unknown>[]) ?? []

  for (const row of [...buyerNegotiations, ...ownerNegotiations]) {
    if (!row?.id) continue
    const key = String(row.id)
    const existing = negotiationMap.get(key)
    if (!existing) {
      negotiationMap.set(key, row)
      continue
    }

    const existingStamp = Date.parse(String(existing.updated_at ?? existing.created_at ?? ''))
    const currentStamp = Date.parse(String(row.updated_at ?? row.created_at ?? ''))
    if (!Number.isNaN(currentStamp) && (Number.isNaN(existingStamp) || currentStamp >= existingStamp)) {
      negotiationMap.set(key, row)
    }
  }

  const negotiationsRaw = Array.from(negotiationMap.values())
  const negotiationIds = negotiationsRaw.map((row) => String(row.id)).filter(Boolean)
  const negotiationPropertyIdsUnique = Array.from(
    new Set(negotiationsRaw.map((row) => String(row.property_id ?? '')).filter(Boolean))
  )

  const [negotiationPropertiesRes, proposalRowsRes] = await Promise.all([
    negotiationPropertyIdsUnique.length > 0
      ? supabase
          .from('properties')
          .select('id, title, city, neighborhood')
          .in('id', negotiationPropertyIdsUnique)
      : Promise.resolve({ data: [], error: null }),
    negotiationIds.length > 0
      ? supabase
          .from('property_proposals')
          .select(
            'id, negotiation_id, status, title, created_at, updated_at, sent_at, commission_value, broker_seller_profile_id, broker_buyer_profile_id'
          )
          .in('negotiation_id', negotiationIds)
      : Promise.resolve({ data: [], error: null })
  ])

  const negotiationPropertyMap = new Map<string, Record<string, unknown>>(
    ((negotiationPropertiesRes.data as Record<string, unknown>[]) ?? []).map((row) => [String(row.id), row])
  )

  const proposalByNegotiationId = new Map<string, Record<string, unknown>>()
  const scoreProposal = (row: Record<string, unknown>) => {
    const stamp = Date.parse(String(row.updated_at ?? row.sent_at ?? row.created_at ?? ''))
    return Number.isFinite(stamp) ? stamp : 0
  }

  for (const proposal of (proposalRowsRes.data as Record<string, unknown>[]) ?? []) {
    const negotiationId = String(proposal.negotiation_id ?? '')
    if (!negotiationId) continue
    const current = proposalByNegotiationId.get(negotiationId)
    if (!current || scoreProposal(proposal) >= scoreProposal(current)) {
      proposalByNegotiationId.set(negotiationId, proposal)
    }
  }

  const proposalIds = Array.from(proposalByNegotiationId.values())
    .map((proposal) => String(proposal.id ?? ''))
    .filter(Boolean)

  const proposalPaymentsRes =
    proposalIds.length > 0
      ? await supabase
          .from('property_proposal_payments')
          .select('proposal_id, amount')
          .in('proposal_id', proposalIds)
      : { data: [], error: null }

  const proposalTotalById = new Map<string, number>()
  for (const payment of (proposalPaymentsRes.data as Array<{ proposal_id: string; amount: number | null }>) ?? []) {
    const proposalId = String(payment.proposal_id ?? '')
    if (!proposalId) continue
    const amount = Number(payment.amount ?? 0)
    if (!Number.isFinite(amount)) continue
    proposalTotalById.set(proposalId, (proposalTotalById.get(proposalId) ?? 0) + amount)
  }

  const negotiations = (
    negotiationsRaw
      .map((row) => {
        const negotiationId = String(row.id ?? '')
        const propertyId = String(row.property_id ?? '')
        const proposal = proposalByNegotiationId.get(negotiationId) ?? null
        if (!proposal) return null

        const proposalId = String(proposal.id ?? '')
        const paymentTotal = proposalId ? proposalTotalById.get(proposalId) ?? null : null
        const fallbackTotal = Number(proposal.commission_value ?? 0)
        const proposalTotalValue =
          paymentTotal !== null ? paymentTotal : Number.isFinite(fallbackTotal) ? fallbackTotal : null

        const isBuyer = String(row.person_id ?? '') === id
        const isOwner = !!propertyId && ownedPropertyIdSet.has(propertyId)
        const involvement =
          isBuyer && isOwner ? 'buyer_owner' : isBuyer ? 'buyer' : isOwner ? 'owner' : 'participant'

        return {
          id: negotiationId,
          property_id: propertyId || null,
          person_id: row.person_id ?? null,
          lead_id: row.lead_id ?? null,
          status: row.status ?? null,
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
          property: propertyId ? negotiationPropertyMap.get(propertyId) ?? null : null,
          property_title: propertyId ? negotiationPropertyMap.get(propertyId)?.title ?? null : null,
          negotiation_involvement: involvement,
          proposal_id: proposalId || null,
          proposal_title: proposal.title ?? null,
          proposal_status: proposal.status ?? null,
          proposal_created_at: proposal.created_at ?? null,
          proposal_updated_at: proposal.updated_at ?? proposal.sent_at ?? proposal.created_at ?? null,
          proposal_total_value: proposalTotalValue,
          broker_seller_profile_id: proposal.broker_seller_profile_id ?? null,
          broker_buyer_profile_id: proposal.broker_buyer_profile_id ?? null
        } as Record<string, unknown>
      })
      .filter((row) => row !== null) as Record<string, unknown>[]
  ).sort((a, b) => {
    const aStamp = Date.parse(String(a.proposal_updated_at ?? a.updated_at ?? a.created_at ?? ''))
    const bStamp = Date.parse(String(b.proposal_updated_at ?? b.updated_at ?? b.created_at ?? ''))
    if (Number.isNaN(aStamp) && Number.isNaN(bStamp)) return 0
    if (Number.isNaN(aStamp)) return 1
    if (Number.isNaN(bStamp)) return -1
    return bStamp - aStamp
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
