import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { requireRole, type UserProfile } from '@/lib/auth'
import { isMissingRelationError } from '@/lib/finance/errors'
import { createClient } from '@/lib/supabaseServer'

import DealFinancialActionsClient from '../financeiro/DealFinancialActionsClient'

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
  closed_at: string | null
  gross_value: number | null
  notes: string | null
}

type SnapshotRow = {
  deal_id: string
  broker_user_id: string | null
  gross_value: number | null
  total_commission_value: number | null
  broker_commission_value: number | null
  company_commission_value: number | null
  partner_commission_value: number | null
  status: 'waiting_receipt' | 'payable' | 'paid' | string | null
}

type PropertyRow = {
  id: string
  title: string | null
}

type ReceivableRow = {
  id: string
  origin_id: string | null
  status: string | null
  amount_total: number | null
  amount_open: number | null
  due_date: string | null
  paid_at: string | null
}

type DistributionRow = {
  id: string
  deal_id: string | null
  payout_status: string | null
  amount: number | null
}

type PayableRow = {
  id: string
  origin_id: string | null
  status: string | null
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

function sum(values: number[]): number {
  return values.reduce((acc, curr) => acc + curr, 0)
}

function snapshotStatusLabel(value: string | null): string {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'payable') return 'A pagar'
  if (normalized === 'paid') return 'Paga'
  return 'Aguardando recebimento'
}

function receivableStatusLabel(value: string | null): string {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'paid') return 'Recebido'
  if (normalized === 'partial') return 'Parcial'
  if (normalized === 'overdue') return 'Em atraso'
  if (normalized === 'canceled') return 'Cancelado'
  return 'Em aberto'
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

function statusTone(status: string | null): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'paid') return 'bg-emerald-100 text-emerald-800'
  if (normalized === 'payable') return 'bg-indigo-100 text-indigo-800'
  if (normalized === 'waiting_receipt') return 'bg-amber-100 text-amber-800'
  if (normalized === 'overdue') return 'bg-rose-100 text-rose-800'
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

export default async function ErpContratosPage({ searchParams }: PageProps) {
  const profile = await requireRole(['admin', 'gestor', 'corretor'])
  const supabase = await createClient()
  const isManager = profile.role === 'admin' || profile.role === 'gestor'

  const params = await searchParams
  const fromParam = getSingleParam(params.from)
  const toParam = getSingleParam(params.to)
  const brokerParam = getSingleParam(params.broker)
  const snapshotStatusParam = getSingleParam(params.snapshot_status)

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
  const selectedSnapshotStatus = snapshotStatusParam && snapshotStatusParam !== 'all' ? snapshotStatusParam : null

  let dealsQuery = supabase
    .from('deals')
    .select('id, property_id, owner_user_id, closed_at, gross_value, notes')
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
          <h1 className="text-xl font-semibold text-slate-900">Contratos / Vendas</h1>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            A tabela `deals` ainda nao esta disponivel neste banco.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Contratos / Vendas</h1>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Erro ao carregar contratos/vendas: {dealsRes.error.message}
        </p>
      </div>
    )
  }

  const deals = (dealsRes.data ?? []) as DealRow[]
  const dealIds = Array.from(new Set(deals.map((item) => item.id).filter(Boolean)))
  const propertyIds = Array.from(new Set(deals.map((item) => String(item.property_id || '')).filter(Boolean)))

  const [snapshotsRes, propertiesRes, receivablesRes, distributionsRes] = await Promise.all([
    dealIds.length > 0
      ? supabase
          .from('deal_commission_snapshots')
          .select(
            'deal_id, broker_user_id, gross_value, total_commission_value, broker_commission_value, company_commission_value, partner_commission_value, status'
          )
          .in('deal_id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length > 0
      ? supabase.from('properties').select('id, title').in('id', propertyIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length > 0
      ? supabase
          .from('receivables')
          .select('id, origin_id, status, amount_total, amount_open, due_date, paid_at')
          .eq('origin_type', 'deal')
          .in('origin_id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length > 0
      ? supabase
          .from('finance_distributions')
          .select('id, deal_id, payout_status, amount')
          .eq('role', 'broker')
          .in('deal_id', dealIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const snapshots = (snapshotsRes.data ?? []) as SnapshotRow[]
  const properties = (propertiesRes.data ?? []) as PropertyRow[]
  const receivables = (receivablesRes.data ?? []) as ReceivableRow[]
  const distributions = (distributionsRes.data ?? []) as DistributionRow[]

  const distributionIds = distributions.map((item) => item.id).filter(Boolean)
  const payablesRes =
    distributionIds.length > 0
      ? await supabase
          .from('payables')
          .select('id, origin_id, status')
          .eq('origin_type', 'deal_commission_distribution')
          .in('origin_id', distributionIds)
      : { data: [], error: null as { message?: string } | null }

  const payables = (payablesRes.data ?? []) as PayableRow[]

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

  const distributionByDealId = new Map<string, DistributionRow[]>()
  for (const distribution of distributions) {
    const key = String(distribution.deal_id || '')
    if (!key) continue
    const list = distributionByDealId.get(key) ?? []
    list.push(distribution)
    distributionByDealId.set(key, list)
  }

  let rows = deals.map((deal) => {
    const property = propertyById.get(String(deal.property_id || '')) ?? null
    const snapshot = snapshotByDealId.get(deal.id) ?? null
    const receivable = receivableByDealId.get(deal.id) ?? null
    const dist = distributionByDealId.get(deal.id) ?? []

    const brokerPayables = dist.flatMap((distribution) => payablesByDistributionId.get(distribution.id) ?? [])
    const brokerPayablesOpen = brokerPayables.filter((item) => String(item.status || '').toLowerCase() !== 'paid').length
    const brokerPayablesPaid = brokerPayables.filter((item) => String(item.status || '').toLowerCase() === 'paid').length

    return {
      deal,
      property,
      snapshot,
      receivable,
      brokerPayablesOpen,
      brokerPayablesPaid,
      brokerDistributions: dist,
      brokerName: resolveBrokerName(
        snapshot?.broker_user_id || deal.owner_user_id || null,
        brokerOptions,
        profile
      ),
    }
  })

  if (selectedSnapshotStatus) {
    rows = rows.filter((row) => String(row.snapshot?.status || '').toLowerCase() === selectedSnapshotStatus)
  }

  const totalDeals = rows.length
  const totalGrossValue = sum(rows.map((row) => Math.max(toFiniteNumber(row.deal.gross_value), 0)))
  const totalCommission = sum(rows.map((row) => Math.max(toFiniteNumber(row.snapshot?.total_commission_value), 0)))
  const totalBrokerCommission = sum(rows.map((row) => Math.max(toFiniteNumber(row.snapshot?.broker_commission_value), 0)))

  const totalReceivable = sum(rows.map((row) => Math.max(toFiniteNumber(row.receivable?.amount_total), 0)))
  const totalReceivableOpen = sum(rows.map((row) => Math.max(toFiniteNumber(row.receivable?.amount_open), 0)))
  const totalReceivablePaid = Math.max(totalReceivable - totalReceivableOpen, 0)

  const waitingCount = rows.filter((row) => String(row.snapshot?.status || '').toLowerCase() === 'waiting_receipt').length
  const payableCount = rows.filter((row) => String(row.snapshot?.status || '').toLowerCase() === 'payable').length
  const paidCount = rows.filter((row) => String(row.snapshot?.status || '').toLowerCase() === 'paid').length

  const selectedBrokerName = selectedBrokerId
    ? resolveBrokerName(selectedBrokerId, brokerOptions, profile)
    : 'Carteira geral'

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Contratos / Vendas</h1>
        <p className="text-sm text-slate-600">
          Deals confirmados com financeiro congelado e controle de recebimento/comissao. {selectedBrokerName} - {formatDate(rangeStart.toISOString())} ate {formatDate(rangeEnd.toISOString())}
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
              <span>Status comissao</span>
              <select
                name="snapshot_status"
                defaultValue={selectedSnapshotStatus ?? 'all'}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">Todos</option>
                <option value="waiting_receipt">Aguardando recebimento</option>
                <option value="payable">A pagar</option>
                <option value="paid">Paga</option>
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
                href="/erp/contratos"
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </a>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Deals confirmados" value={String(totalDeals)} hint="Fechamentos no periodo." />
        <MetricCard label="VGV fechado" value={formatCurrency(totalGrossValue)} hint="Somatorio de gross_value." />
        <MetricCard label="Recebido" value={formatCurrency(totalReceivablePaid)} hint={`Total de recebiveis ${formatCurrency(totalReceivable)}`} />
        <MetricCard label="A receber" value={formatCurrency(totalReceivableOpen)} hint="Saldo em aberto nos recebiveis." />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Comissao total" value={formatCurrency(totalCommission)} hint="Snapshot financeiro por deal." />
        <MetricCard label="Comissao corretor" value={formatCurrency(totalBrokerCommission)} hint="Parcela de corretagem prevista." />
        <MetricCard label="Ciclo comissao" value={`${waitingCount}/${payableCount}/${paidCount}`} hint="Aguardando - A pagar - Paga" />
        <MetricCard
          label="Ritmo de recebimento"
          value={totalReceivable > 0 ? `${Math.round((totalReceivablePaid / totalReceivable) * 100)}%` : '0%'}
          hint="Percentual recebido da carteira no intervalo."
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lista de contratos/vendas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Nenhum deal confirmado encontrado para o filtro atual.
            </p>
          ) : null}

          {rows.slice(0, 120).map((row) => {
            const propertyTitle = row.property?.title || (row.deal.property_id ? `Imovel ${row.deal.property_id.slice(0, 8)}` : 'Imovel nao informado')
            const snapshotStatus = String(row.snapshot?.status || 'waiting_receipt').toLowerCase() as
              | 'waiting_receipt'
              | 'payable'
              | 'paid'
            const receivableStatus = row.receivable?.status || 'open'

            return (
              <div key={row.deal.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-900">{propertyTitle}</div>
                    <div className="text-xs text-slate-500">Deal {row.deal.id.slice(0, 8)} - Corretor: {row.brokerName}</div>
                    <div className="text-xs text-slate-500">Fechado em: {formatDate(row.deal.closed_at)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone(snapshotStatus)}`}>
                      {snapshotStatusLabel(snapshotStatus)}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone(receivableStatus)}`}>
                      Recebivel: {receivableStatusLabel(receivableStatus)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div>Valor do negocio</div>
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(Math.max(toFiniteNumber(row.deal.gross_value), 0))}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div>Comissao total</div>
                    <div className="text-sm font-bold text-slate-900">
                      {formatCurrency(Math.max(toFiniteNumber(row.snapshot?.total_commission_value), 0))}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div>Comissao corretor</div>
                    <div className="text-sm font-bold text-slate-900">
                      {formatCurrency(Math.max(toFiniteNumber(row.snapshot?.broker_commission_value), 0))}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div>Recebivel (aberto)</div>
                    <div className="text-sm font-bold text-slate-900">
                      {formatCurrency(Math.max(toFiniteNumber(row.receivable?.amount_open), 0))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Payables corretor - abertos: {row.brokerPayablesOpen} - pagos: {row.brokerPayablesPaid} - distribuicoes: {row.brokerDistributions.length}
                  </div>
                  {row.snapshot ? (
                    <DealFinancialActionsClient
                      dealId={row.deal.id}
                      canManage={isManager}
                      snapshotStatus={snapshotStatus}
                    />
                  ) : (
                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      Snapshot de comissao nao encontrado para este deal.
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
