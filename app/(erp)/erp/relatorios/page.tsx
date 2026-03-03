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
}

type ReceivableRow = {
  id: string
  origin_id: string | null
  status: string | null
  amount_total: number | null
  amount_open: number | null
}

type DistributionRow = {
  id: string
  deal_id: string | null
  broker_user_id: string | null
  payout_status: string | null
  amount: number | null
}

type PayableRow = {
  id: string
  origin_id: string | null
  status: string | null
  amount_total: number | null
  amount_open: number | null
}

type PaymentRow = {
  id: string
  direction: string | null
  amount: number | null
  status: string | null
  paid_at: string | null
  broker_user_id: string | null
}

type PropertyRow = {
  id: string
  title: string | null
}

type BarDatum = {
  label: string
  value: number
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

function sum(values: number[]): number {
  return values.reduce((acc, curr) => acc + curr, 0)
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR')
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

export default async function ErpRelatoriosPage({ searchParams }: PageProps) {
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
          <h1 className="text-xl font-semibold text-slate-900">Relatorios</h1>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            A tabela `deals` ainda nao esta disponivel neste banco.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Relatorios</h1>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Erro ao carregar base de relatorios: {dealsRes.error.message}
        </p>
      </div>
    )
  }

  const deals = (dealsRes.data ?? []) as DealRow[]
  const dealIds = Array.from(new Set(deals.map((item) => item.id).filter(Boolean)))
  const propertyIds = Array.from(new Set(deals.map((item) => String(item.property_id || '')).filter(Boolean)))

  const [snapshotsRes, receivablesRes, propertiesRes, distributionsRes, paymentsRes] = await Promise.all([
    dealIds.length > 0
      ? supabase
          .from('deal_commission_snapshots')
          .select('deal_id, broker_user_id, total_commission_value, broker_commission_value')
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
      ? supabase.from('properties').select('id, title').in('id', propertyIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length > 0
      ? supabase
          .from('finance_distributions')
          .select('id, deal_id, broker_user_id, payout_status, amount')
          .eq('role', 'broker')
          .in('deal_id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    (() => {
      let query = supabase
        .from('payments')
        .select('id, direction, amount, status, paid_at, broker_user_id')
        .gte('paid_at', rangeStart.toISOString())
        .lte('paid_at', rangeEnd.toISOString())
        .eq('status', 'confirmed')
        .order('paid_at', { ascending: false })
        .limit(5000)

      if (selectedBrokerId) {
        query = query.eq('broker_user_id', selectedBrokerId)
      }

      return query
    })(),
  ])

  const snapshots = (snapshotsRes.data ?? []) as SnapshotRow[]
  const receivables = (receivablesRes.data ?? []) as ReceivableRow[]
  const properties = (propertiesRes.data ?? []) as PropertyRow[]
  const distributions = (distributionsRes.data ?? []) as DistributionRow[]
  const payments = (paymentsRes.data ?? []) as PaymentRow[]

  const distributionIds = distributions.map((item) => item.id).filter(Boolean)
  const payablesRes =
    distributionIds.length > 0
      ? await supabase
          .from('payables')
          .select('id, origin_id, status, amount_total, amount_open')
          .eq('origin_type', 'deal_commission_distribution')
          .in('origin_id', distributionIds)
      : { data: [], error: null as { message?: string } | null }

  const payables = (payablesRes.data ?? []) as PayableRow[]

  const warnings: string[] = []
  if (paymentsRes.error) {
    if (isMissingRelationError(paymentsRes.error)) {
      warnings.push('Tabela `payments` nao disponivel. Fluxo de caixa em modo parcial.')
    } else {
      warnings.push(`Falha em payments: ${paymentsRes.error.message}`)
    }
  }

  if (payablesRes.error) {
    if (isMissingRelationError(payablesRes.error)) {
      warnings.push('Tabela `payables` nao disponivel. Despesas em modo parcial.')
    } else {
      warnings.push(`Falha em payables: ${payablesRes.error.message}`)
    }
  }

  const propertyById = new Map(properties.map((row) => [row.id, row]))
  const snapshotByDealId = new Map(snapshots.map((row) => [row.deal_id, row]))
  const receivableByDealId = new Map(
    receivables
      .filter((row) => !!row.origin_id)
      .map((row) => [String(row.origin_id), row])
  )

  const payablesByDistributionId = new Map<string, PayableRow[]>()
  for (const payable of payables) {
    const key = String(payable.origin_id || '')
    if (!key) continue
    const list = payablesByDistributionId.get(key) ?? []
    list.push(payable)
    payablesByDistributionId.set(key, list)
  }

  const distributionsByDealId = new Map<string, DistributionRow[]>()
  for (const distribution of distributions) {
    const key = String(distribution.deal_id || '')
    if (!key) continue
    const list = distributionsByDealId.get(key) ?? []
    list.push(distribution)
    distributionsByDealId.set(key, list)
  }

  const receitaPrevista = sum(receivables.map((row) => Math.max(toFiniteNumber(row.amount_total), 0)))
  const receitaRecebida = sum(
    receivables.map((row) => {
      const total = Math.max(toFiniteNumber(row.amount_total), 0)
      const open = Math.max(toFiniteNumber(row.amount_open), 0)
      return Math.max(total - open, 0)
    })
  )

  const despesaPrevista = sum(payables.map((row) => Math.max(toFiniteNumber(row.amount_total), 0)))
  const despesaPaga = sum(
    payables.map((row) => {
      const total = Math.max(toFiniteNumber(row.amount_total), 0)
      const open = Math.max(toFiniteNumber(row.amount_open), 0)
      return Math.max(total - open, 0)
    })
  )

  const resultadoPrevisto = receitaPrevista - despesaPrevista
  const resultadoRealizado = receitaRecebida - despesaPaga

  const entradasFluxo = sum(
    payments
      .filter((row) => String(row.direction || '').toLowerCase() === 'in')
      .map((row) => Math.max(toFiniteNumber(row.amount), 0))
  )
  const saidasFluxo = sum(
    payments
      .filter((row) => String(row.direction || '').toLowerCase() === 'out')
      .map((row) => Math.max(toFiniteNumber(row.amount), 0))
  )
  const fluxoLiquido = entradasFluxo - saidasFluxo

  const comissaoPrevista = sum(snapshots.map((row) => Math.max(toFiniteNumber(row.broker_commission_value), 0)))
  const comissaoPaga = sum(
    distributions
      .filter((row) => String(row.payout_status || '').toLowerCase() === 'paid')
      .map((row) => Math.max(toFiniteNumber(row.amount), 0))
  )

  const propertyAccumulator = new Map<string, { gross: number; received: number }>()
  for (const deal of deals) {
    const propertyId = String(deal.property_id || '')
    if (!propertyId) continue

    const receivable = receivableByDealId.get(deal.id)
    const received = receivable
      ? Math.max(toFiniteNumber(receivable.amount_total) - toFiniteNumber(receivable.amount_open), 0)
      : 0

    const current = propertyAccumulator.get(propertyId) ?? { gross: 0, received: 0 }
    propertyAccumulator.set(propertyId, {
      gross: current.gross + Math.max(toFiniteNumber(deal.gross_value), 0),
      received: current.received + received,
    })
  }

  const resultByProperty: BarDatum[] = Array.from(propertyAccumulator.entries())
    .map(([propertyId, values]) => ({
      label: propertyById.get(propertyId)?.title || `Imovel ${propertyId.slice(0, 8)}`,
      value: values.received,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const brokerAccumulator = new Map<string, { gross: number; deals: number; commissionExpected: number; commissionPaid: number }>()

  for (const deal of deals) {
    const brokerId = String(deal.owner_user_id || '')
    if (!brokerId) continue

    const current = brokerAccumulator.get(brokerId) ?? {
      gross: 0,
      deals: 0,
      commissionExpected: 0,
      commissionPaid: 0,
    }

    brokerAccumulator.set(brokerId, {
      ...current,
      gross: current.gross + Math.max(toFiniteNumber(deal.gross_value), 0),
      deals: current.deals + 1,
    })
  }

  for (const snapshot of snapshots) {
    const brokerId = String(snapshot.broker_user_id || '')
    if (!brokerId) continue

    const current = brokerAccumulator.get(brokerId) ?? {
      gross: 0,
      deals: 0,
      commissionExpected: 0,
      commissionPaid: 0,
    }

    brokerAccumulator.set(brokerId, {
      ...current,
      commissionExpected: current.commissionExpected + Math.max(toFiniteNumber(snapshot.broker_commission_value), 0),
    })
  }

  for (const distribution of distributions) {
    const brokerId = String(distribution.broker_user_id || '')
    if (!brokerId) continue

    const current = brokerAccumulator.get(brokerId) ?? {
      gross: 0,
      deals: 0,
      commissionExpected: 0,
      commissionPaid: 0,
    }

    const paidIncrement = String(distribution.payout_status || '').toLowerCase() === 'paid' ? Math.max(toFiniteNumber(distribution.amount), 0) : 0

    brokerAccumulator.set(brokerId, {
      ...current,
      commissionPaid: current.commissionPaid + paidIncrement,
    })
  }

  const resultByBroker: BarDatum[] = Array.from(brokerAccumulator.entries())
    .map(([brokerId, values]) => ({
      label: resolveBrokerName(brokerId, brokerOptions, profile),
      value: values.gross,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const commissionByBroker: BarDatum[] = Array.from(brokerAccumulator.entries())
    .map(([brokerId, values]) => ({
      label: resolveBrokerName(brokerId, brokerOptions, profile),
      value: values.commissionExpected,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const selectedBrokerName = selectedBrokerId
    ? resolveBrokerName(selectedBrokerId, brokerOptions, profile)
    : 'Carteira geral'

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Relatorios</h1>
        <p className="text-sm text-slate-600">
          DRE simplificada, fluxo de caixa e comissoes por periodo. {selectedBrokerName} - {formatDate(rangeStart.toISOString())} ate {formatDate(rangeEnd.toISOString())}
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
                href="/erp/relatorios"
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </a>
            </div>
          </form>

          {warnings.length > 0 ? (
            <div className="mt-3 space-y-2">
              {warnings.map((warning) => (
                <p key={warning} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Receita prevista" value={formatCurrency(receitaPrevista)} hint="Recebiveis gerados no periodo." />
        <MetricCard label="Receita recebida" value={formatCurrency(receitaRecebida)} hint="Recebiveis liquidados/parciais." />
        <MetricCard label="Despesa prevista" value={formatCurrency(despesaPrevista)} hint="Payables de comissao no periodo." />
        <MetricCard label="Despesa paga" value={formatCurrency(despesaPaga)} hint="Payables liquidados/parciais." />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Resultado previsto" value={formatCurrency(resultadoPrevisto)} hint="Receita prevista - despesa prevista." />
        <MetricCard label="Resultado realizado" value={formatCurrency(resultadoRealizado)} hint="Receita recebida - despesa paga." />
        <MetricCard label="Entradas de caixa" value={formatCurrency(entradasFluxo)} hint="Payments confirmados (in)." />
        <MetricCard label="Saidas de caixa" value={formatCurrency(saidasFluxo)} hint="Payments confirmados (out)." />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Fluxo liquido" value={formatCurrency(fluxoLiquido)} hint="Entradas - saidas no periodo." />
        <MetricCard label="Comissao prevista" value={formatCurrency(comissaoPrevista)} hint="Snapshots de corretagem." />
        <MetricCard label="Comissao paga" value={formatCurrency(comissaoPaga)} hint="Distribuicoes broker com payout pago." />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BarList
          title="Resultado por imovel (recebido)"
          subtitle="Top imoveis por valor efetivamente recebido."
          data={resultByProperty}
          formatter={formatCurrency}
          emptyLabel="Sem recebimento por imovel no periodo."
        />

        <BarList
          title="Resultado por corretor (VGV)"
          subtitle="Top corretores por VGV fechado."
          data={resultByBroker}
          formatter={formatCurrency}
          emptyLabel="Sem resultado por corretor no periodo."
        />

        <BarList
          title="Comissao prevista por corretor"
          subtitle="Comparativo de previsao de comissao."
          data={commissionByBroker}
          formatter={formatCurrency}
          emptyLabel="Sem comissao prevista no periodo."
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo executivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>
              Deals analisados: <span className="font-semibold text-slate-900">{deals.length}</span>
            </p>
            <p>
              Recebiveis analisados: <span className="font-semibold text-slate-900">{receivables.length}</span>
            </p>
            <p>
              Payables analisados: <span className="font-semibold text-slate-900">{payables.length}</span>
            </p>
            <p>
              Payments confirmados: <span className="font-semibold text-slate-900">{payments.length}</span>
            </p>
            <p className="text-xs text-slate-500">
              Escopo atual: DRE simplificada e fluxo de caixa operacional para tomada de decisao da V1.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
