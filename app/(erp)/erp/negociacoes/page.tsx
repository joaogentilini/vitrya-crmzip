import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { requireRole, type UserProfile } from '@/lib/auth'
import { isMissingRelationError } from '@/lib/finance/errors'
import { createClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

type SearchParamValue = string | string[] | undefined

type PageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>
}

type BrokerOption = {
  id: string
  full_name: string | null
  email: string | null
}

type NegotiationRow = {
  id: string
  property_id: string | null
  person_id: string | null
  lead_id: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

type PropertyRow = {
  id: string
  title: string | null
  owner_user_id: string | null
}

type PersonRow = {
  id: string
  full_name: string | null
  email: string | null
  phone_e164: string | null
}

type ProposalRow = {
  id: string
  negotiation_id: string | null
  status: string | null
  title: string | null
  updated_at: string | null
  created_at: string | null
  broker_seller_profile_id: string | null
  broker_buyer_profile_id: string | null
  commission_value: number | null
}

type NegotiationStage = 'draft' | 'active' | 'won' | 'lost' | 'canceled' | 'other'

type NegotiationViewRow = {
  negotiation: NegotiationRow
  property: PropertyRow | null
  person: PersonRow | null
  proposal: ProposalRow | null
  brokerName: string
  stage: NegotiationStage
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function getSingleParam(value: SearchParamValue): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0]?.trim()
    return first ? first : null
  }

  return null
}

function parseDateInput(value: string | null): Date | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function formatCurrency(value: number): string {
  return BRL.format(value)
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR')
}

function scoreProposalTs(proposal: ProposalRow): number {
  const value = proposal.updated_at ?? proposal.created_at ?? null
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

function normalizeStage(status: string | null): NegotiationStage {
  const normalized = String(status || '').toLowerCase()

  if (!normalized) return 'other'

  if (
    normalized.includes('won') ||
    normalized.includes('ganh') ||
    normalized.includes('vendid') ||
    normalized.includes('sold') ||
    normalized.includes('confirm')
  ) {
    return 'won'
  }

  if (normalized.includes('lost') || normalized.includes('perd')) return 'lost'
  if (normalized.includes('cancel')) return 'canceled'

  if (
    normalized.includes('draft') ||
    normalized.includes('novo') ||
    normalized.includes('rascunho') ||
    normalized.includes('inicial')
  ) {
    return 'draft'
  }

  if (
    normalized.includes('active') ||
    normalized.includes('aberto') ||
    normalized.includes('andamento') ||
    normalized.includes('open') ||
    normalized.includes('proposta')
  ) {
    return 'active'
  }

  return 'other'
}

function stageLabel(stage: NegotiationStage): string {
  if (stage === 'draft') return 'Draft'
  if (stage === 'active') return 'Ativa'
  if (stage === 'won') return 'Ganha'
  if (stage === 'lost') return 'Perdida'
  if (stage === 'canceled') return 'Cancelada'
  return 'Outra'
}

function proposalStatusLabel(value: string | null): string {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'approved') return 'Aprovada'
  if (normalized === 'rejected') return 'Rejeitada'
  if (normalized === 'counterproposal') return 'Contraproposta'
  if (normalized === 'in_review') return 'Em analise'
  if (normalized === 'draft') return 'Rascunho'
  return normalized ? normalized : 'Sem proposta'
}

function resolveBrokerName(brokerId: string | null, options: BrokerOption[], profile: UserProfile): string {
  const id = String(brokerId || '')
  if (!id) return 'Sem corretor'

  if (id === profile.id) {
    return profile.full_name || profile.email || 'Minha carteira'
  }

  const found = options.find((item) => item.id === id)
  if (!found) return `Corretor ${id.slice(0, 8)}`
  return found.full_name || found.email || `Corretor ${id.slice(0, 8)}`
}

function stageBadgeClass(stage: NegotiationStage): string {
  if (stage === 'won') return 'bg-emerald-100 text-emerald-800'
  if (stage === 'lost') return 'bg-rose-100 text-rose-800'
  if (stage === 'canceled') return 'bg-slate-200 text-slate-700'
  if (stage === 'active') return 'bg-blue-100 text-blue-800'
  if (stage === 'draft') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}

export default async function ErpNegociacoesPage({ searchParams }: PageProps) {
  const profile = await requireRole(['admin', 'gestor', 'corretor'])
  const supabase = await createClient()
  const isManager = profile.role === 'admin' || profile.role === 'gestor'

  const params = await searchParams
  const fromParam = getSingleParam(params.from)
  const toParam = getSingleParam(params.to)
  const brokerParam = getSingleParam(params.broker)
  const stageParam = getSingleParam(params.stage)

  const today = new Date()
  const defaultEnd = startOfDay(today)
  const defaultStart = addDays(defaultEnd, -29)

  const parsedStart = parseDateInput(fromParam) ?? defaultStart
  const parsedEnd = parseDateInput(toParam) ?? defaultEnd

  const startDate = parsedStart <= parsedEnd ? parsedStart : parsedEnd
  const endDate = parsedStart <= parsedEnd ? parsedEnd : parsedStart

  const rangeStart = startOfDay(startDate)
  const rangeEnd = endOfDay(endDate)

  const dateFromValue = toDateInputValue(startDate)
  const dateToValue = toDateInputValue(endDate)

  let brokerOptions: BrokerOption[] = []
  if (isManager) {
    const brokersRes = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'corretor')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (!brokersRes.error) {
      brokerOptions = (brokersRes.data ?? []) as BrokerOption[]
    }
  }

  const selectedBrokerId = isManager ? (brokerParam && brokerParam !== 'all' ? brokerParam : null) : profile.id
  const selectedStage = (stageParam && stageParam !== 'all' ? stageParam : null) as NegotiationStage | null

  const negotiationsRes = await supabase
    .from('property_negotiations')
    .select('id, property_id, person_id, lead_id, status, created_at, updated_at')
    .gte('created_at', rangeStart.toISOString())
    .lte('created_at', rangeEnd.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)

  if (negotiationsRes.error) {
    if (isMissingRelationError(negotiationsRes.error)) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Negociacoes</h1>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            A tabela `property_negotiations` ainda nao esta disponivel neste banco.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Negociacoes</h1>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Erro ao carregar negociacoes: {negotiationsRes.error.message}
        </p>
      </div>
    )
  }

  const negotiations = (negotiationsRes.data ?? []) as NegotiationRow[]
  const negotiationIds = Array.from(new Set(negotiations.map((item) => item.id).filter(Boolean)))
  const propertyIds = Array.from(new Set(negotiations.map((item) => String(item.property_id || '')).filter(Boolean)))
  const personIds = Array.from(new Set(negotiations.map((item) => String(item.person_id || '')).filter(Boolean)))

  const [propertiesRes, peopleRes, proposalsRes] = await Promise.all([
    propertyIds.length > 0
      ? supabase.from('properties').select('id, title, owner_user_id').in('id', propertyIds)
      : Promise.resolve({ data: [], error: null }),
    personIds.length > 0
      ? supabase.from('people').select('id, full_name, email, phone_e164').in('id', personIds)
      : Promise.resolve({ data: [], error: null }),
    negotiationIds.length > 0
      ? supabase
          .from('property_proposals')
          .select(
            'id, negotiation_id, status, title, updated_at, created_at, broker_seller_profile_id, broker_buyer_profile_id, commission_value'
          )
          .in('negotiation_id', negotiationIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const properties = (propertiesRes.data ?? []) as PropertyRow[]
  const people = (peopleRes.data ?? []) as PersonRow[]
  const proposals = (proposalsRes.data ?? []) as ProposalRow[]

  const propertyById = new Map(properties.map((row) => [row.id, row]))
  const personById = new Map(people.map((row) => [row.id, row]))

  const proposalByNegotiationId = new Map<string, ProposalRow>()
  for (const proposal of proposals) {
    const negotiationId = String(proposal.negotiation_id || '')
    if (!negotiationId) continue

    const current = proposalByNegotiationId.get(negotiationId)
    if (!current || scoreProposalTs(proposal) >= scoreProposalTs(current)) {
      proposalByNegotiationId.set(negotiationId, proposal)
    }
  }

  const brokerIds = new Set<string>()
  for (const property of properties) {
    if (property.owner_user_id) brokerIds.add(property.owner_user_id)
  }
  for (const proposal of proposals) {
    if (proposal.broker_seller_profile_id) brokerIds.add(proposal.broker_seller_profile_id)
    if (proposal.broker_buyer_profile_id) brokerIds.add(proposal.broker_buyer_profile_id)
  }

  const extraBrokerIds = Array.from(brokerIds)
  const brokerRowsRes =
    extraBrokerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name, email').in('id', extraBrokerIds)
      : { data: [], error: null as { message?: string } | null }

  const brokerNameById = new Map<string, string>()
  for (const broker of (brokerRowsRes.data ?? []) as BrokerOption[]) {
    brokerNameById.set(broker.id, broker.full_name || broker.email || `Corretor ${broker.id.slice(0, 8)}`)
  }

  let rows: NegotiationViewRow[] = negotiations.map((negotiation) => {
    const property = propertyById.get(String(negotiation.property_id || '')) ?? null
    const person = personById.get(String(negotiation.person_id || '')) ?? null
    const proposal = proposalByNegotiationId.get(negotiation.id) ?? null
    const brokerId = property?.owner_user_id || proposal?.broker_seller_profile_id || proposal?.broker_buyer_profile_id || null
    const brokerName = brokerId
      ? brokerNameById.get(brokerId) || resolveBrokerName(brokerId, brokerOptions, profile)
      : 'Sem corretor'

    return {
      negotiation,
      property,
      person,
      proposal,
      brokerName,
      stage: normalizeStage(negotiation.status),
    }
  })

  if (selectedBrokerId) {
    rows = rows.filter((row) => {
      const propertyBroker = String(row.property?.owner_user_id || '')
      if (propertyBroker) return propertyBroker === selectedBrokerId
      const proposalBroker = String(
        row.proposal?.broker_seller_profile_id || row.proposal?.broker_buyer_profile_id || ''
      )
      return proposalBroker === selectedBrokerId
    })
  }

  if (selectedStage) {
    rows = rows.filter((row) => row.stage === selectedStage)
  }

  const counts = {
    total: rows.length,
    draft: rows.filter((row) => row.stage === 'draft').length,
    active: rows.filter((row) => row.stage === 'active').length,
    won: rows.filter((row) => row.stage === 'won').length,
    lost: rows.filter((row) => row.stage === 'lost').length,
    canceled: rows.filter((row) => row.stage === 'canceled').length,
    withoutProposal: rows.filter((row) => !row.proposal?.id).length,
  }

  const stageDistribution: Array<{ key: NegotiationStage; label: string; value: number }> = [
    { key: 'draft', label: 'Draft', value: counts.draft },
    { key: 'active', label: 'Ativa', value: counts.active },
    { key: 'won', label: 'Ganha', value: counts.won },
    { key: 'lost', label: 'Perdida', value: counts.lost },
    { key: 'canceled', label: 'Cancelada', value: counts.canceled },
    { key: 'other', label: 'Outra', value: rows.filter((row) => row.stage === 'other').length },
  ]

  const maxStage = Math.max(...stageDistribution.map((item) => item.value), 0)

  const selectedBrokerName = selectedBrokerId
    ? resolveBrokerName(selectedBrokerId, brokerOptions, profile)
    : 'Carteira geral'

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Negociacoes</h1>
        <p className="text-sm text-slate-600">
          Funil de negociacoes com status machine e proposta mais recente por negocio. {selectedBrokerName} - {formatDate(rangeStart.toISOString())} ate {formatDate(rangeEnd.toISOString())}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <label className="space-y-1 text-xs text-slate-600">
              <span>De</span>
              <input
                type="date"
                name="from"
                defaultValue={dateFromValue}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-600">
              <span>Ate</span>
              <input
                type="date"
                name="to"
                defaultValue={dateToValue}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            {isManager ? (
              <label className="space-y-1 text-xs text-slate-600">
                <span>Corretor</span>
                <select
                  name="broker"
                  defaultValue={selectedBrokerId ?? 'all'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                >
                  <option value="all">Todos</option>
                  {brokerOptions.map((broker) => (
                    <option key={broker.id} value={broker.id}>
                      {broker.full_name || broker.email || broker.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="broker" value={profile.id} />
            )}

            <label className="space-y-1 text-xs text-slate-600">
              <span>Status machine</span>
              <select
                name="stage"
                defaultValue={selectedStage ?? 'all'}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">Todos</option>
                <option value="draft">Draft</option>
                <option value="active">Ativa</option>
                <option value="won">Ganha</option>
                <option value="lost">Perdida</option>
                <option value="canceled">Cancelada</option>
                <option value="other">Outra</option>
              </select>
            </label>

            <div className="flex items-end gap-2 md:col-span-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Aplicar
              </button>
              <a
                href="/erp/negociacoes"
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </a>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total" value={String(counts.total)} hint="Negociacoes no periodo." />
        <MetricCard label="Ativas" value={String(counts.active)} hint="Negociacoes em andamento." />
        <MetricCard label="Ganhas" value={String(counts.won)} hint="Negocios convertidos." />
        <MetricCard label="Sem proposta" value={String(counts.withoutProposal)} hint="Sem proposta vinculada." />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status machine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageDistribution.map((item) => {
              const widthPercent = maxStage > 0 ? Math.max((item.value / maxStage) * 100, 3) : 0
              return (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span>{item.label}</span>
                    <span className="font-semibold text-slate-800">{item.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-700" style={{ width: `${widthPercent}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lista de negociacoes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Nenhuma negociacao encontrada para o filtro atual.
              </p>
            ) : null}

            {rows.slice(0, 120).map((row) => {
              const personName = row.person?.full_name || row.person?.email || row.person?.phone_e164 || 'Pessoa nao informada'
              const propertyTitle = row.property?.title || (row.negotiation.property_id ? `Imovel ${row.negotiation.property_id.slice(0, 8)}` : 'Imovel nao informado')
              const proposalStatus = proposalStatusLabel(row.proposal?.status || null)
              const proposalValue = Math.max(toFiniteNumber(row.proposal?.commission_value), 0)

              return (
                <div key={row.negotiation.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900">{propertyTitle}</div>
                      <div className="text-xs text-slate-500">Negociacao {row.negotiation.id.slice(0, 8)} - Corretor: {row.brokerName}</div>
                      <div className="text-xs text-slate-500">Cliente: {personName}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${stageBadgeClass(row.stage)}`}>
                        {stageLabel(row.stage)}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">{proposalStatus}</span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <div>Criada em</div>
                      <div className="text-sm font-semibold text-slate-900">{formatDate(row.negotiation.created_at)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <div>Atualizada em</div>
                      <div className="text-sm font-semibold text-slate-900">{formatDate(row.negotiation.updated_at)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <div>Comissao proposta</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {proposalValue > 0 ? formatCurrency(proposalValue) : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
