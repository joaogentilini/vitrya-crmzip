import { requireRole, type UserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

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

type ProposalRow = Record<string, unknown>

type PaymentRow = Record<string, unknown>

type NormalizedProposal = {
  id: string
  occurredAt: Date
  baseValue: number
  commissionValue: number
  commissionPercent: number
  categoryName: string
}

type BarDatum = {
  label: string
  value: number
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const PERCENT = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function sum(values: number[]): number {
  return values.reduce((acc, curr) => acc + curr, 0)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return sum(values) / values.length
}

function formatCurrency(value: number): string {
  return BRL.format(value)
}

function formatPercent(value: number): string {
  return PERCENT.format(value / 100)
}

function isReceivedStatus(status: string): boolean {
  const normalized = status.toLowerCase()
  return normalized === 'received' || normalized === 'paid' || normalized === 'settled'
}

function isMissingRelationError(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('relation') && message.includes('does not exist')
}

function toBucketKey(date: Date, mode: 'day' | 'month'): string {
  if (mode === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  return toDateInputValue(date)
}

function bucketLabelFromKey(key: string, mode: 'day' | 'month'): string {
  if (mode === 'month') {
    const [yearRaw, monthRaw] = key.split('-')
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    if (!Number.isFinite(year) || !Number.isFinite(month)) return key
    return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  }

  return new Date(`${key}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

function resolveBrokerName(brokerId: string | null, profile: UserProfile, options: BrokerOption[]): string {
  if (!brokerId) return 'Carteira geral'
  if (brokerId === profile.id) return profile.full_name || profile.email || 'Minha carteira'

  const found = options.find((item) => item.id === brokerId)
  if (!found) return `Corretor ${brokerId.slice(0, 8)}`
  return found.full_name || found.email || `Corretor ${brokerId.slice(0, 8)}`
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

function BarList({
  title,
  subtitle,
  data,
  formatter,
  emptyLabel,
}: {
  title: string
  subtitle?: string
  data: BarDatum[]
  formatter: (value: number) => string
  emptyLabel?: string
}) {
  const rows = data.filter((row) => Number.isFinite(row.value) && row.value >= 0)
  const maxValue = rows.length > 0 ? Math.max(...rows.map((row) => row.value), 0) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">{title}</CardTitle>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyLabel || 'Sem dados para o periodo selecionado.'}</p>
        ) : (
          rows.map((row) => {
            const widthPercent = maxValue > 0 ? Math.max((row.value / maxValue) * 100, 2) : 0

            return (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span className="truncate">{row.label}</span>
                  <span className="font-semibold text-slate-800">{formatter(row.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-700" style={{ width: `${widthPercent}%` }} />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

export default async function ErpFinanceiroPage({ searchParams }: PageProps) {
  const profile = await requireRole(['admin', 'gestor', 'corretor'])
  const supabase = await createClient()
  const isManager = profile.role === 'admin' || profile.role === 'gestor'

  const params = await searchParams
  const fromParam = getSingleParam(params.from)
  const toParam = getSingleParam(params.to)
  const brokerParam = getSingleParam(params.broker)
  const goalParam = getSingleParam(params.goal)

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
    const { data: brokers, error: brokersError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'corretor')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (!brokersError) {
      brokerOptions = (brokers ?? []) as BrokerOption[]
    }
  }

  const selectedBrokerId = isManager ? (brokerParam && brokerParam !== 'all' ? brokerParam : null) : profile.id
  const selectedBrokerName = resolveBrokerName(selectedBrokerId, profile, brokerOptions)

  const parsedGoal = toFiniteNumber(goalParam)
  const goalCommission = parsedGoal && parsedGoal > 0 ? parsedGoal : selectedBrokerId ? 50000 : 150000

  let proposalsQuery = supabase.from('property_proposals').select('*').eq('status', 'approved').order('updated_at', {
    ascending: false,
  })

  if (selectedBrokerId) {
    proposalsQuery = proposalsQuery.or(
      `broker_seller_profile_id.eq.${selectedBrokerId},broker_buyer_profile_id.eq.${selectedBrokerId}`
    )
  }

  const { data: proposalRows, error: proposalsError } = await proposalsQuery.limit(5000)

  if (proposalsError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Financeiro</h1>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Erro ao carregar propostas: {proposalsError.message}
        </p>
      </div>
    )
  }

  const proposalItems = (proposalRows ?? []) as ProposalRow[]
  const propertyIds = Array.from(
    new Set(
      proposalItems
        .map((row) => (typeof row.property_id === 'string' ? row.property_id : null))
        .filter((value): value is string => !!value)
    )
  )

  const propertyCategoryByPropertyId = new Map<string, string | null>()
  let categoryNameById = new Map<string, string>()

  if (propertyIds.length > 0) {
    const { data: propertyRows } = await supabase
      .from('properties')
      .select('id, property_category_id')
      .in('id', propertyIds)

    const categoryIds = new Set<string>()

    for (const row of (propertyRows ?? []) as Array<{ id: string; property_category_id: string | null }>) {
      propertyCategoryByPropertyId.set(row.id, row.property_category_id)
      if (row.property_category_id) categoryIds.add(row.property_category_id)
    }

    if (categoryIds.size > 0) {
      const { data: categoryRows } = await supabase
        .from('property_categories')
        .select('id, name')
        .in('id', Array.from(categoryIds))

      categoryNameById = new Map(
        ((categoryRows ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name || 'Sem categoria'])
      )
    }
  }

  const normalizedProposals: NormalizedProposal[] = []

  for (const row of proposalItems) {
    const id = typeof row.id === 'string' ? row.id : null
    if (!id) continue

    const occurredAt =
      toDate(row.approved_at) ?? toDate(row.sent_at) ?? toDate(row.updated_at) ?? toDate(row.created_at) ?? null

    if (!occurredAt) continue

    const commissionValue = toFiniteNumber(row.broker_commission_value) ?? toFiniteNumber(row.commission_value) ?? 0
    const baseFromRow = toFiniteNumber(row.base_value)
    const ownerNet = toFiniteNumber(row.owner_net_value)
    const baseValue = baseFromRow ?? (ownerNet !== null ? ownerNet + commissionValue : 0)

    const commissionPercent =
      toFiniteNumber(row.commission_percent) ?? (baseValue > 0 ? (commissionValue / baseValue) * 100 : 0)

    const propertyId = typeof row.property_id === 'string' ? row.property_id : null
    const categoryId = propertyId ? propertyCategoryByPropertyId.get(propertyId) ?? null : null
    const categoryName = categoryId ? categoryNameById.get(categoryId) ?? 'Sem categoria' : 'Sem categoria'

    normalizedProposals.push({
      id,
      occurredAt,
      baseValue: Math.max(baseValue, 0),
      commissionValue: Math.max(commissionValue, 0),
      commissionPercent: Math.max(commissionPercent, 0),
      categoryName,
    })
  }

  const intervalProposals = normalizedProposals.filter(
    (proposal) => proposal.occurredAt.getTime() >= rangeStart.getTime() && proposal.occurredAt.getTime() <= rangeEnd.getTime()
  )

  const totalCommissionPortfolio = sum(normalizedProposals.map((proposal) => proposal.commissionValue))
  const intervalSalesCount = intervalProposals.length
  const intervalSalesValue = sum(intervalProposals.map((proposal) => proposal.baseValue))
  const intervalTicketAverage = intervalSalesCount > 0 ? intervalSalesValue / intervalSalesCount : 0
  const intervalCommissionAverage = average(intervalProposals.map((proposal) => proposal.commissionPercent))

  let paymentRows: PaymentRow[] = []
  let paymentsTableAvailable = true

  let paymentQuery = supabase.from('broker_commission_payments').select('*').order('created_at', { ascending: false })

  if (selectedBrokerId) {
    paymentQuery = paymentQuery.eq('broker_profile_id', selectedBrokerId)
  }

  const { data: paymentsData, error: paymentsError } = await paymentQuery.limit(5000)

  if (paymentsError) {
    if (isMissingRelationError(paymentsError)) {
      paymentsTableAvailable = false
    } else {
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Financeiro</h1>
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Erro ao carregar pagamentos de comissao: {paymentsError.message}
          </p>
        </div>
      )
    }
  } else {
    paymentRows = (paymentsData ?? []) as PaymentRow[]
  }

  let receivedInRange = 0
  let receivedAll = 0
  let pendingFromPayments = 0

  for (const row of paymentRows) {
    const amount = Math.max(toFiniteNumber(row.amount) ?? 0, 0)
    const status = String(row.status ?? '').toLowerCase()
    const receivedAt = toDate(row.received_at)
    const fallbackDate = toDate(row.expected_at) ?? toDate(row.created_at)
    const referenceDate = receivedAt ?? fallbackDate

    if (isReceivedStatus(status)) {
      receivedAll += amount

      if (referenceDate) {
        const stamp = referenceDate.getTime()
        if (stamp >= rangeStart.getTime() && stamp <= rangeEnd.getTime()) {
          receivedInRange += amount
        }
      }
    } else {
      pendingFromPayments += amount
    }
  }

  const pendingCommission =
    paymentRows.length > 0 ? pendingFromPayments : Math.max(totalCommissionPortfolio - receivedAll, 0)

  const goalProgress = goalCommission > 0 ? (receivedInRange / goalCommission) * 100 : 0
  const goalRemaining = Math.max(goalCommission - receivedInRange, 0)
  const salesDays = Math.max(
    1,
    Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  )
  const bucketMode: 'day' | 'month' = salesDays <= 62 ? 'day' : 'month'

  const bucketMap = new Map<string, { salesCount: number; salesValue: number; commissionPercentSum: number; commissionPercentCount: number }>()

  for (const proposal of intervalProposals) {
    const key = toBucketKey(proposal.occurredAt, bucketMode)
    const current =
      bucketMap.get(key) ??
      {
        salesCount: 0,
        salesValue: 0,
        commissionPercentSum: 0,
        commissionPercentCount: 0,
      }

    bucketMap.set(key, {
      salesCount: current.salesCount + 1,
      salesValue: current.salesValue + proposal.baseValue,
      commissionPercentSum: current.commissionPercentSum + proposal.commissionPercent,
      commissionPercentCount: current.commissionPercentCount + 1,
    })
  }

  const sortedBucketEntries = Array.from(bucketMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  const salesCountSeries: BarDatum[] = sortedBucketEntries.map(([key, value]) => ({
    label: bucketLabelFromKey(key, bucketMode),
    value: value.salesCount,
  }))

  const ticketAverageSeries: BarDatum[] = sortedBucketEntries.map(([key, value]) => ({
    label: bucketLabelFromKey(key, bucketMode),
    value: value.salesCount > 0 ? value.salesValue / value.salesCount : 0,
  }))

  const averageCommissionSeries: BarDatum[] = sortedBucketEntries.map(([key, value]) => ({
    label: bucketLabelFromKey(key, bucketMode),
    value: value.commissionPercentCount > 0 ? value.commissionPercentSum / value.commissionPercentCount : 0,
  }))

  const categoryAccumulator = new Map<string, { salesValue: number; commissionValue: number }>()

  for (const proposal of intervalProposals) {
    const current = categoryAccumulator.get(proposal.categoryName) ?? { salesValue: 0, commissionValue: 0 }
    categoryAccumulator.set(proposal.categoryName, {
      salesValue: current.salesValue + proposal.baseValue,
      commissionValue: current.commissionValue + proposal.commissionValue,
    })
  }

  const salesByCategory: BarDatum[] = Array.from(categoryAccumulator.entries())
    .map(([label, value]) => ({ label, value: value.salesValue }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const commissionByCategory: BarDatum[] = Array.from(categoryAccumulator.entries())
    .map(([label, value]) => ({ label, value: value.commissionValue }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Financeiro</h1>
        <p className="text-sm text-slate-600">
          {selectedBrokerName} - intervalo {rangeStart.toLocaleDateString('pt-BR')} ate {rangeEnd.toLocaleDateString('pt-BR')}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid grid-cols-1 gap-3 md:grid-cols-5">
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
              <span>Meta de comissao (R$)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                name="goal"
                defaultValue={goalCommission.toFixed(2)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Aplicar
              </button>
              <a
                href="/erp/financeiro"
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </a>
            </div>
          </form>

          {!paymentsTableAvailable ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              A tabela `broker_commission_payments` ainda nao existe neste banco. Os indicadores de recebido/pendente estao em modo estimado.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Comissao total da carteira"
          value={formatCurrency(totalCommissionPortfolio)}
          hint={`${normalizedProposals.length} venda(s) aprovada(s)`}
        />
        <MetricCard
          label="Comissao recebida no periodo"
          value={formatCurrency(receivedInRange)}
          hint={paymentsTableAvailable ? 'Calculado por pagamentos recebidos.' : 'Estimativa sem ledger financeiro.'}
        />
        <MetricCard
          label="Comissao pendente"
          value={formatCurrency(pendingCommission)}
          hint={paymentsTableAvailable ? 'Pagamentos com status diferente de recebido.' : 'Carteira menos recebido.'}
        />
        <MetricCard
          label="Meta de comissao"
          value={formatCurrency(goalCommission)}
          hint={goalRemaining > 0 ? `Faltam ${formatCurrency(goalRemaining)} (${formatPercent(goalProgress)}).` : `Meta batida (${formatPercent(goalProgress)}).`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo comercial do periodo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Numero de vendas</div>
            <div className="text-2xl font-bold text-slate-900">{intervalSalesCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Ticket medio</div>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(intervalTicketAverage)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Media de comissao</div>
            <div className="text-2xl font-bold text-slate-900">{formatPercent(intervalCommissionAverage)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BarList
          title="Numero de vendas por intervalo"
          subtitle={bucketMode === 'day' ? 'Agrupado por dia.' : 'Agrupado por mes.'}
          data={salesCountSeries}
          formatter={(value) => value.toFixed(0)}
          emptyLabel="Sem vendas no periodo filtrado."
        />

        <BarList
          title="Ticket medio por intervalo"
          subtitle={bucketMode === 'day' ? 'Media diaria por vendas aprovadas.' : 'Media mensal por vendas aprovadas.'}
          data={ticketAverageSeries}
          formatter={formatCurrency}
          emptyLabel="Sem vendas para calcular ticket medio."
        />

        <BarList
          title="Valor de vendas por categoria"
          subtitle="Top categorias por valor no intervalo selecionado."
          data={salesByCategory}
          formatter={formatCurrency}
          emptyLabel="Sem categorias com vendas no periodo."
        />

        <BarList
          title="Comissao por categoria"
          subtitle="Comissao do corretor por categoria no intervalo."
          data={commissionByCategory}
          formatter={formatCurrency}
          emptyLabel="Sem comissao por categoria no periodo."
        />
      </div>

      <BarList
        title="Media de comissao (%) por intervalo"
        subtitle={bucketMode === 'day' ? 'Media diaria de percentual de comissao.' : 'Media mensal de percentual de comissao.'}
        data={averageCommissionSeries}
        formatter={formatPercent}
        emptyLabel="Sem dados de comissao para o periodo."
      />
    </div>
  )
}
