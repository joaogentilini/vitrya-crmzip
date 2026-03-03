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

type DealRow = {
  id: string
  property_id: string | null
  owner_user_id: string | null
  gross_value: number | null
  closed_at: string | null
}

type SnapshotRow = {
  deal_id: string
  broker_user_id: string | null
  total_commission_value: number | null
  broker_commission_value: number | null
  status: string | null
}

type ReceivableRow = {
  id: string
  origin_id: string | null
  status: string | null
  amount_total: number | null
  amount_open: number | null
}

type PropertyRow = {
  id: string
  title: string | null
  owner_user_id: string | null
  property_category_id: string | null
}

type CategoryRow = {
  id: string
  name: string | null
}

type TopBrokerRow = {
  brokerId: string
  brokerName: string
  dealsCount: number
  grossValue: number
  brokerCommission: number
}

type CategorySummaryRow = {
  label: string
  grossValue: number
  dealsCount: number
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

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return PERCENT.format(0)
  return PERCENT.format(value / 100)
}

function sum(values: number[]): number {
  return values.reduce((acc, curr) => acc + curr, 0)
}

function metricHintDateRange(start: Date, end: Date): string {
  return `${start.toLocaleDateString('pt-BR')} ate ${end.toLocaleDateString('pt-BR')}`
}

function normalizeSnapshotStatus(value: string | null): 'waiting_receipt' | 'payable' | 'paid' | 'other' {
  const status = String(value || '').toLowerCase()
  if (status === 'waiting_receipt') return 'waiting_receipt'
  if (status === 'payable') return 'payable'
  if (status === 'paid') return 'paid'
  return 'other'
}

function resolveBrokerName(brokerId: string, options: BrokerOption[], profile: UserProfile): string {
  if (brokerId === profile.id) {
    return profile.full_name || profile.email || 'Minha carteira'
  }

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

export default async function ErpHomePage({ searchParams }: PageProps) {
  const profile = await requireRole(['admin', 'gestor', 'corretor'])
  const supabase = await createClient()
  const isManager = profile.role === 'admin' || profile.role === 'gestor'

  const params = await searchParams
  const fromParam = getSingleParam(params.from)
  const toParam = getSingleParam(params.to)
  const brokerParam = getSingleParam(params.broker)

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

  let dealsQuery = supabase
    .from('deals')
    .select('id, property_id, owner_user_id, gross_value, closed_at')
    .eq('status', 'confirmed')
    .gte('closed_at', rangeStart.toISOString())
    .lte('closed_at', rangeEnd.toISOString())
    .order('closed_at', { ascending: false })
    .limit(5000)

  if (selectedBrokerId) {
    dealsQuery = dealsQuery.eq('owner_user_id', selectedBrokerId)
  }

  const dealsRes = await dealsQuery
  if (dealsRes.error) {
    if (isMissingRelationError(dealsRes.error)) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">ERP - Visao geral</h1>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            A tabela `deals` ainda nao esta disponivel neste banco. Aplique as migrations do ERP (deals + snapshots).
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">ERP - Visao geral</h1>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Erro ao carregar dados de deals: {dealsRes.error.message}
        </p>
      </div>
    )
  }

  const deals = (dealsRes.data ?? []) as DealRow[]
  const dealIds = Array.from(new Set(deals.map((row) => row.id).filter(Boolean)))
  const propertyIds = Array.from(new Set(deals.map((row) => String(row.property_id || '')).filter(Boolean)))

  const [snapshotsRes, receivablesRes, propertiesRes] = await Promise.all([
    dealIds.length > 0
      ? supabase
          .from('deal_commission_snapshots')
          .select('deal_id, broker_user_id, total_commission_value, broker_commission_value, status')
          .in('deal_id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length > 0
      ? supabase
          .from('receivables')
          .select('id, origin_id, status, amount_total, amount_open')
          .eq('origin_type', 'deal')
          .in('origin_id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length > 0
      ? supabase.from('properties').select('id, title, owner_user_id, property_category_id').in('id', propertyIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const snapshots = (snapshotsRes.data ?? []) as SnapshotRow[]
  const receivables = (receivablesRes.data ?? []) as ReceivableRow[]
  const properties = (propertiesRes.data ?? []) as PropertyRow[]

  const propertyById = new Map(properties.map((row) => [row.id, row]))

  const categoryIds = Array.from(new Set(properties.map((row) => String(row.property_category_id || '')).filter(Boolean)))

  const categoryNameById = new Map<string, string>()
  if (categoryIds.length > 0) {
    const categoriesRes = await supabase.from('property_categories').select('id, name').in('id', categoryIds)

    for (const category of (categoriesRes.data ?? []) as CategoryRow[]) {
      categoryNameById.set(category.id, category.name || 'Sem categoria')
    }
  }

  const totalDeals = deals.length
  const totalGrossValue = sum(deals.map((row) => Math.max(toFiniteNumber(row.gross_value), 0)))
  const averageTicket = totalDeals > 0 ? totalGrossValue / totalDeals : 0

  const totalCommission = sum(snapshots.map((row) => Math.max(toFiniteNumber(row.total_commission_value), 0)))
  const totalBrokerCommission = sum(snapshots.map((row) => Math.max(toFiniteNumber(row.broker_commission_value), 0)))

  const receivableTotal = sum(receivables.map((row) => Math.max(toFiniteNumber(row.amount_total), 0)))
  const receivableOpen = sum(receivables.map((row) => Math.max(toFiniteNumber(row.amount_open), 0)))
  const receivedTotal = Math.max(receivableTotal - receivableOpen, 0)
  const overdueTotal = sum(
    receivables
      .filter((row) => String(row.status || '').toLowerCase() === 'overdue')
      .map((row) => Math.max(toFiniteNumber(row.amount_open), 0))
  )
  const delinquencyPercent = receivableTotal > 0 ? (overdueTotal / receivableTotal) * 100 : 0

  const statusCount = {
    waiting_receipt: 0,
    payable: 0,
    paid: 0,
    other: 0,
  }

  for (const snapshot of snapshots) {
    const key = normalizeSnapshotStatus(snapshot.status)
    statusCount[key] += 1
  }

  const brokerAccumulator = new Map<string, { dealsCount: number; grossValue: number; brokerCommission: number }>()
  for (const deal of deals) {
    const property = propertyById.get(String(deal.property_id || ''))
    const brokerId = String(property?.owner_user_id || deal.owner_user_id || '')
    if (!brokerId) continue

    const current = brokerAccumulator.get(brokerId) ?? {
      dealsCount: 0,
      grossValue: 0,
      brokerCommission: 0,
    }

    brokerAccumulator.set(brokerId, {
      dealsCount: current.dealsCount + 1,
      grossValue: current.grossValue + Math.max(toFiniteNumber(deal.gross_value), 0),
      brokerCommission: current.brokerCommission,
    })
  }

  for (const snapshot of snapshots) {
    const brokerId = String(snapshot.broker_user_id || '')
    if (!brokerId) continue
    const current = brokerAccumulator.get(brokerId) ?? {
      dealsCount: 0,
      grossValue: 0,
      brokerCommission: 0,
    }
    brokerAccumulator.set(brokerId, {
      ...current,
      brokerCommission: current.brokerCommission + Math.max(toFiniteNumber(snapshot.broker_commission_value), 0),
    })
  }

  const topBrokers: TopBrokerRow[] = Array.from(brokerAccumulator.entries())
    .map(([brokerId, values]) => ({
      brokerId,
      brokerName: resolveBrokerName(brokerId, brokerOptions, profile),
      dealsCount: values.dealsCount,
      grossValue: values.grossValue,
      brokerCommission: values.brokerCommission,
    }))
    .sort((a, b) => b.grossValue - a.grossValue)
    .slice(0, 8)

  const categoryAccumulator = new Map<string, { grossValue: number; dealsCount: number }>()
  for (const deal of deals) {
    const property = propertyById.get(String(deal.property_id || ''))
    const categoryId = String(property?.property_category_id || '')
    const label = categoryId ? categoryNameById.get(categoryId) || 'Sem categoria' : 'Sem categoria'

    const current = categoryAccumulator.get(label) ?? { grossValue: 0, dealsCount: 0 }
    categoryAccumulator.set(label, {
      grossValue: current.grossValue + Math.max(toFiniteNumber(deal.gross_value), 0),
      dealsCount: current.dealsCount + 1,
    })
  }

  const categorySummary: CategorySummaryRow[] = Array.from(categoryAccumulator.entries())
    .map(([label, values]) => ({
      label,
      grossValue: values.grossValue,
      dealsCount: values.dealsCount,
    }))
    .sort((a, b) => b.grossValue - a.grossValue)
    .slice(0, 8)

  const maxCategoryValue = categorySummary.length > 0 ? Math.max(...categorySummary.map((item) => item.grossValue)) : 0
  const selectedBrokerName = selectedBrokerId ? resolveBrokerName(selectedBrokerId, brokerOptions, profile) : 'Carteira geral'

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">ERP - Visao geral</h1>
        <p className="text-sm text-slate-600">
          Panorama executivo de VGV, receita, comissoes e inadimplencia. {selectedBrokerName} - {metricHintDateRange(rangeStart, rangeEnd)}
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

            <div className="flex items-end gap-2 md:col-span-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Aplicar
              </button>
              <a
                href="/erp"
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </a>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="VGV fechado"
          value={formatCurrency(totalGrossValue)}
          hint={`${totalDeals} deal(s) confirmado(s)`}
        />
        <MetricCard label="Ticket medio" value={formatCurrency(averageTicket)} hint="Media por deal confirmado." />
        <MetricCard
          label="Receita recebida"
          value={formatCurrency(receivedTotal)}
          hint={`Carteira total ${formatCurrency(receivableTotal)}`}
        />
        <MetricCard
          label="Inadimplencia"
          value={formatCurrency(overdueTotal)}
          hint={`${formatPercent(delinquencyPercent)} da carteira no periodo.`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Comissao total" value={formatCurrency(totalCommission)} hint="Somatorio dos snapshots de comissao." />
        <MetricCard label="Comissao corretor" value={formatCurrency(totalBrokerCommission)} hint="Parcela de corretagem prevista." />
        <MetricCard label="A receber" value={formatCurrency(receivableOpen)} hint="Valor ainda aberto em receivaveis de deal." />
        <MetricCard
          label="Ciclo de comissao"
          value={`${statusCount.waiting_receipt}/${statusCount.payable}/${statusCount.paid}`}
          hint="Aguardando - A pagar - Paga"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top corretores (VGV)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topBrokers.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Sem fechamentos no periodo selecionado.
              </p>
            ) : (
              topBrokers.map((broker) => (
                <div key={broker.brokerId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{broker.brokerName}</div>
                      <div className="text-xs text-slate-500">{broker.dealsCount} deal(s) confirmado(s)</div>
                    </div>
                    <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(broker.grossValue)}</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Comissao corretor: {formatCurrency(broker.brokerCommission)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resultado por categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {categorySummary.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Nenhum dado por categoria no periodo selecionado.
              </p>
            ) : (
              categorySummary.map((row) => {
                const widthPercent = maxCategoryValue > 0 ? Math.max((row.grossValue / maxCategoryValue) * 100, 3) : 0

                return (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                      <span className="truncate">{row.label}</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(row.grossValue)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-700" style={{ width: `${widthPercent}%` }} />
                    </div>
                    <div className="text-[11px] text-slate-500">{row.dealsCount} deal(s)</div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
