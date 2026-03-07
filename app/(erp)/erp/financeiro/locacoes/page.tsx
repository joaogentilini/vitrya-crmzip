import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { requireRole, type UserProfile } from '@/lib/auth'
import { isMissingRelationError } from '@/lib/finance/errors'
import { createClient } from '@/lib/supabaseServer'

import RentCycleActionsClient from './RentCycleActionsClient'

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

type RentDealRow = {
  id: string
  property_id: string | null
  owner_user_id: string | null
  gross_value: number | null
  closed_at: string | null
}

type PropertyRow = {
  id: string
  title: string | null
  rent_price: number | null
}

type RentCycleRow = {
  id: string
  deal_id: string
  property_id: string | null
  broker_user_id: string | null
  owner_payable_id: string | null
  competence_month: string
  due_date: string
  rent_amount: number | null
  commission_total: number | null
  owner_net_amount: number | null
  status: string | null
  created_at: string
}

type PayableRow = {
  id: string
  status: string | null
  paid_at: string | null
  due_date: string | null
  amount_total: number | null
}

type CycleStatus = 'open' | 'received' | 'owner_paid' | 'cancelled'
type PayableStatus = 'open' | 'paid' | 'overdue' | 'canceled'

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

function normalizeMonth(value: string | null): string {
  const raw = String(value || '').trim()
  if (/^\d{4}-\d{2}$/.test(raw)) return raw
  return new Date().toISOString().slice(0, 7)
}

function monthStart(month: string): string {
  return `${month}-01`
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function sum(values: number[]): number {
  return values.reduce((acc, curr) => acc + curr, 0)
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

function normalizeCycleStatus(value: string | null): CycleStatus {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'received') return 'received'
  if (normalized === 'owner_paid') return 'owner_paid'
  if (normalized === 'cancelled') return 'cancelled'
  return 'open'
}

function cycleStatusLabel(value: CycleStatus): string {
  if (value === 'received') return 'Recebido'
  if (value === 'owner_paid') return 'Repasse pago'
  if (value === 'cancelled') return 'Cancelado'
  return 'Aberto'
}

function cycleStatusTone(value: CycleStatus): string {
  if (value === 'owner_paid') return 'bg-emerald-100 text-emerald-800'
  if (value === 'received') return 'bg-blue-100 text-blue-800'
  if (value === 'cancelled') return 'bg-slate-200 text-slate-700'
  return 'bg-amber-100 text-amber-800'
}

function normalizePayableStatus(value: string | null): PayableStatus {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'paid') return 'paid'
  if (normalized === 'overdue') return 'overdue'
  if (normalized === 'canceled' || normalized === 'cancelled') return 'canceled'
  return 'open'
}

function payableStatusLabel(value: PayableStatus): string {
  if (value === 'paid') return 'Pago'
  if (value === 'overdue') return 'Vencido'
  if (value === 'canceled') return 'Cancelado'
  return 'Aberto'
}

function payableStatusTone(value: PayableStatus): string {
  if (value === 'paid') return 'bg-emerald-100 text-emerald-800'
  if (value === 'overdue') return 'bg-red-100 text-red-800'
  if (value === 'canceled') return 'bg-slate-200 text-slate-700'
  return 'bg-amber-100 text-amber-800'
}

function resolveBrokerName(brokerId: string | null, options: BrokerOption[], profile: UserProfile): string {
  const id = String(brokerId || '')
  if (!id) return 'Sem corretor'
  if (id === profile.id) return profile.full_name || profile.email || 'Minha carteira'

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

export default async function ErpFinanceiroLocacoesPage({ searchParams }: PageProps) {
  const profile = await requireRole(['admin', 'gestor', 'corretor'])
  const supabase = await createClient()
  const isManager = profile.role === 'admin' || profile.role === 'gestor'

  const params = await searchParams
  const brokerParam = getSingleParam(params.broker)
  const competenceParam = getSingleParam(params.competence)

  const selectedCompetence = normalizeMonth(competenceParam)
  const competenceDate = monthStart(selectedCompetence)
  const selectedBrokerId = isManager ? (brokerParam && brokerParam !== 'all' ? brokerParam : null) : profile.id

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

  let dealsQuery = supabase
    .from('deals')
    .select('id, property_id, owner_user_id, gross_value, closed_at')
    .eq('status', 'confirmed')
    .eq('operation_type', 'rent')
    .order('closed_at', { ascending: false })
    .limit(1000)

  if (selectedBrokerId) {
    dealsQuery = dealsQuery.eq('owner_user_id', selectedBrokerId)
  }

  const dealsRes = await dealsQuery
  if (dealsRes.error) {
    if (isMissingRelationError(dealsRes.error)) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Financeiro - Locacoes</h1>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            A tabela `deals` ainda nao esta disponivel. Aplique as migrations do ERP financeiro.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Financeiro - Locacoes</h1>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Erro ao carregar deals de locacao: {dealsRes.error.message}
        </p>
      </div>
    )
  }

  const rentDeals = (dealsRes.data ?? []) as RentDealRow[]
  const propertyIds = Array.from(new Set(rentDeals.map((row) => String(row.property_id || '')).filter(Boolean)))

  const propertiesRes =
    propertyIds.length > 0
      ? await supabase.from('properties').select('id, title, rent_price').in('id', propertyIds)
      : { data: [], error: null as { message?: string } | null }
  const properties = (propertiesRes.data ?? []) as PropertyRow[]
  const propertyById = new Map(properties.map((row) => [row.id, row]))

  let cycleTableAvailable = true
  let cycleTableError: string | null = null
  let monthCycles: RentCycleRow[] = []
  let recentCycles: RentCycleRow[] = []

  const monthCyclesRes = await (() => {
    let query = supabase
      .from('deal_rent_cycles')
      .select(
        'id, deal_id, property_id, broker_user_id, owner_payable_id, competence_month, due_date, rent_amount, commission_total, owner_net_amount, status, created_at'
      )
      .eq('competence_month', competenceDate)
      .order('created_at', { ascending: false })
      .limit(1200)

    if (selectedBrokerId) {
      query = query.eq('broker_user_id', selectedBrokerId)
    }

    return query
  })()

  if (monthCyclesRes.error) {
    if (isMissingRelationError(monthCyclesRes.error)) {
      cycleTableAvailable = false
      cycleTableError = 'Tabela deal_rent_cycles nao encontrada. Aplique a migration 202603061030_deal_rent_cycles_mvp.sql.'
    } else {
      cycleTableAvailable = false
      cycleTableError = monthCyclesRes.error.message || 'Falha ao carregar ciclos de locacao.'
    }
  } else {
    monthCycles = (monthCyclesRes.data ?? []) as RentCycleRow[]
  }

  if (cycleTableAvailable) {
    const recentCyclesRes = await (() => {
      let query = supabase
        .from('deal_rent_cycles')
        .select(
          'id, deal_id, property_id, broker_user_id, owner_payable_id, competence_month, due_date, rent_amount, commission_total, owner_net_amount, status, created_at'
        )
        .order('competence_month', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(80)

      if (selectedBrokerId) {
        query = query.eq('broker_user_id', selectedBrokerId)
      }

      return query
    })()

    if (recentCyclesRes.error) {
      cycleTableAvailable = false
      cycleTableError = recentCyclesRes.error.message || 'Falha ao carregar historico de ciclos.'
    } else {
      recentCycles = (recentCyclesRes.data ?? []) as RentCycleRow[]
    }
  }

  const monthCycleByDeal = new Map<string, RentCycleRow>()
  for (const cycle of monthCycles) {
    if (!monthCycleByDeal.has(cycle.deal_id)) {
      monthCycleByDeal.set(cycle.deal_id, cycle)
    }
  }

  let ownerPayablesError: string | null = null
  let ownerPayablesById = new Map<string, PayableRow>()
  const ownerPayableIds = Array.from(
    new Set([...monthCycles, ...recentCycles].map((row) => String(row.owner_payable_id || '')).filter(Boolean))
  )
  if (cycleTableAvailable && ownerPayableIds.length > 0) {
    const ownerPayablesRes = await supabase
      .from('payables')
      .select('id, status, paid_at, due_date, amount_total')
      .in('id', ownerPayableIds)

    if (ownerPayablesRes.error) {
      ownerPayablesError = ownerPayablesRes.error.message || 'Falha ao carregar extrato de repasse.'
    } else {
      ownerPayablesById = new Map(((ownerPayablesRes.data ?? []) as PayableRow[]).map((row) => [row.id, row]))
    }
  }

  const extraBrokerIds = new Set<string>()
  for (const row of rentDeals) {
    if (row.owner_user_id) extraBrokerIds.add(row.owner_user_id)
  }
  for (const row of recentCycles) {
    if (row.broker_user_id) extraBrokerIds.add(row.broker_user_id)
  }

  const brokerIds = Array.from(extraBrokerIds)
  if (brokerIds.length > 0) {
    const brokerRowsRes = await supabase.from('profiles').select('id, full_name, email').in('id', brokerIds)
    if (!brokerRowsRes.error) {
      const extra = (brokerRowsRes.data ?? []) as BrokerOption[]
      const map = new Map<string, BrokerOption>(brokerOptions.map((row) => [row.id, row]))
      for (const row of extra) map.set(row.id, row)
      brokerOptions = Array.from(map.values())
    }
  }

  const estimatedMonthlyPortfolio = sum(
    rentDeals.map((deal) => {
      const property = propertyById.get(String(deal.property_id || ''))
      return Math.max(toNumber(property?.rent_price), toNumber(deal.gross_value), 0)
    })
  )
  const cyclesGenerated = monthCycleByDeal.size
  const pendingGeneration = Math.max(rentDeals.length - cyclesGenerated, 0)
  const expectedCollection = sum(monthCycles.map((row) => Math.max(toNumber(row.rent_amount), 0)))
  const receivedCollection = sum(
    monthCycles
      .filter((row) => {
        const status = normalizeCycleStatus(row.status)
        return status === 'received' || status === 'owner_paid'
      })
      .map((row) => Math.max(toNumber(row.rent_amount), 0))
  )
  const ownerPaidTotal = sum(
    monthCycles
      .filter((row) => normalizeCycleStatus(row.status) === 'owner_paid')
      .map((row) => Math.max(toNumber(row.owner_net_amount), 0))
  )
  const ownerPendingTotal = sum(
    monthCycles.map((row) => {
      const amount = Math.max(toNumber(row.owner_net_amount), 0)
      if (amount <= 0) return 0

      const status = normalizeCycleStatus(row.status)
      if (status === 'owner_paid') return 0

      const ownerPayable = row.owner_payable_id ? ownerPayablesById.get(row.owner_payable_id) : null
      const ownerPayableStatus = normalizePayableStatus(ownerPayable?.status ?? null)
      return ownerPayableStatus === 'paid' ? 0 : amount
    })
  )

  const selectedBrokerName = selectedBrokerId
    ? resolveBrokerName(selectedBrokerId, brokerOptions, profile)
    : 'Carteira geral'

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Financeiro - Locacoes</h1>
        <p className="text-sm text-slate-600">
          Ciclo mensal de aluguel com recebimento e repasse ao proprietario. {selectedBrokerName} - competencia {selectedCompetence}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="space-y-1 text-xs text-slate-600">
              <span>Competencia (mes)</span>
              <input
                type="month"
                name="competence"
                defaultValue={selectedCompetence}
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
                href="/erp/financeiro/locacoes"
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </a>
            </div>
          </form>

          {!cycleTableAvailable && cycleTableError ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{cycleTableError}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Deals de locacao" value={String(rentDeals.length)} hint="Deals confirmados tipo rent." />
        <MetricCard
          label="Ciclos gerados no mes"
          value={String(cyclesGenerated)}
          hint={`${pendingGeneration} deal(s) ainda sem ciclo.`}
        />
        <MetricCard
          label="Carteira mensal estimada"
          value={formatCurrency(estimatedMonthlyPortfolio)}
          hint="Base de aluguel dos deals ativos."
        />
        <MetricCard
          label="Previsto do mes (ciclos)"
          value={formatCurrency(expectedCollection)}
          hint={cycleTableAvailable ? 'Soma dos ciclos da competencia.' : 'Aguardando tabela de ciclos.'}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Recebido no mes"
          value={formatCurrency(receivedCollection)}
          hint="Status do ciclo: received/owner_paid."
        />
        <MetricCard
          label="Repasse proprietario pago"
          value={formatCurrency(ownerPaidTotal)}
          hint="Status do ciclo owner_paid."
        />
        <MetricCard
          label="Repasse em aberto"
          value={formatCurrency(ownerPendingTotal)}
          hint="Repasse de proprietario ainda nao pago no mes."
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Operacao mensal por deal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rentDeals.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Nenhum deal de locacao confirmado para os filtros atuais.
            </p>
          ) : null}

          {rentDeals.slice(0, 120).map((deal) => {
            const property = propertyById.get(String(deal.property_id || '')) || null
            const cycle = monthCycleByDeal.get(deal.id) || null
            const cycleStatus = cycle ? normalizeCycleStatus(cycle.status) : null
            const propertyTitle = property?.title || (deal.property_id ? `Imovel ${deal.property_id.slice(0, 8)}` : 'Imovel nao informado')
            const monthlyAmount = Math.max(toNumber(property?.rent_price), toNumber(deal.gross_value), 0)

            return (
              <div key={deal.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-900">{propertyTitle}</div>
                    <div className="text-xs text-slate-500">Deal {deal.id.slice(0, 8)} - Corretor: {resolveBrokerName(deal.owner_user_id, brokerOptions, profile)}</div>
                    <div className="text-xs text-slate-500">Valor mensal: {formatCurrency(monthlyAmount)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {cycleStatus ? (
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${cycleStatusTone(cycleStatus)}`}>
                        {cycleStatusLabel(cycleStatus)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">Sem ciclo</span>
                    )}
                    {cycle ? (
                      <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                        Vencimento: {formatDate(cycle.due_date)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Ciclo: {cycle ? cycle.id.slice(0, 8) : 'nao gerado'} - Competencia: {selectedCompetence}
                  </div>
                  {cycleTableAvailable ? (
                    <RentCycleActionsClient
                      dealId={deal.id}
                      cycleId={cycle?.id ?? null}
                      cycleStatus={cycleStatus}
                      competenceMonth={selectedCompetence}
                      canManage={isManager}
                    />
                  ) : null}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {cycleTableAvailable ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historico recente de ciclos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentCycles.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Nenhum ciclo registrado ainda.
              </p>
            ) : null}

            {recentCycles.map((cycle) => {
              const status = normalizeCycleStatus(cycle.status)
              const ownerPayable = cycle.owner_payable_id ? ownerPayablesById.get(cycle.owner_payable_id) : null
              const ownerPayableStatus = normalizePayableStatus(ownerPayable?.status ?? null)
              const property = propertyById.get(String(cycle.property_id || '')) || null
              const propertyTitle = property?.title || (cycle.property_id ? `Imovel ${cycle.property_id.slice(0, 8)}` : 'Imovel')
              const month = String(cycle.competence_month || '').slice(0, 7)

              return (
                <div key={cycle.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{propertyTitle}</div>
                      <div className="text-xs text-slate-500">
                        Competencia {month} - Deal {cycle.deal_id.slice(0, 8)} - Corretor: {resolveBrokerName(cycle.broker_user_id, brokerOptions, profile)}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${cycleStatusTone(status)}`}>
                      {cycleStatusLabel(status)}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <div>Aluguel</div>
                      <div className="text-sm font-semibold text-slate-900">{formatCurrency(Math.max(toNumber(cycle.rent_amount), 0))}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <div>Comissao total</div>
                      <div className="text-sm font-semibold text-slate-900">{formatCurrency(Math.max(toNumber(cycle.commission_total), 0))}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <div>Repasse liquido proprietario</div>
                      <div className="text-sm font-semibold text-slate-900">{formatCurrency(Math.max(toNumber(cycle.owner_net_amount), 0))}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>Vencimento: {formatDate(cycle.due_date)}</span>
                      {ownerPayable ? (
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${payableStatusTone(ownerPayableStatus)}`}
                        >
                          Repasse: {payableStatusLabel(ownerPayableStatus)}
                        </span>
                      ) : null}
                    </div>
                    <RentCycleActionsClient
                      dealId={cycle.deal_id}
                      cycleId={cycle.id}
                      cycleStatus={status}
                      competenceMonth={month}
                      canManage={isManager}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      {cycleTableAvailable ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Extrato simples de repasse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ownerPayablesError ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{ownerPayablesError}</p>
            ) : null}

            {recentCycles.filter((cycle) => Math.max(toNumber(cycle.owner_net_amount), 0) > 0).length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Nenhum repasse de proprietario registrado ainda.
              </p>
            ) : null}

            {recentCycles
              .filter((cycle) => Math.max(toNumber(cycle.owner_net_amount), 0) > 0)
              .slice(0, 60)
              .map((cycle) => {
                const ownerPayable = cycle.owner_payable_id ? ownerPayablesById.get(cycle.owner_payable_id) : null
                const fallbackStatus = normalizeCycleStatus(cycle.status) === 'owner_paid' ? 'paid' : 'open'
                const repasseStatus = normalizePayableStatus(ownerPayable?.status ?? fallbackStatus)
                const property = propertyById.get(String(cycle.property_id || '')) || null
                const propertyTitle = property?.title || (cycle.property_id ? `Imovel ${cycle.property_id.slice(0, 8)}` : 'Imovel')
                const month = String(cycle.competence_month || '').slice(0, 7)

                return (
                  <div key={`repasse-${cycle.id}`} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{propertyTitle}</div>
                        <div className="text-xs text-slate-500">
                          Competencia {month} - Deal {cycle.deal_id.slice(0, 8)} - Corretor: {resolveBrokerName(cycle.broker_user_id, brokerOptions, profile)}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${payableStatusTone(repasseStatus)}`}>
                        {payableStatusLabel(repasseStatus)}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                        <div>Valor do repasse</div>
                        <div className="text-sm font-semibold text-slate-900">{formatCurrency(Math.max(toNumber(cycle.owner_net_amount), 0))}</div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                        <div>Vencimento</div>
                        <div className="text-sm font-semibold text-slate-900">
                          {formatDate(ownerPayable?.due_date ?? cycle.due_date)}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                        <div>Pago em</div>
                        <div className="text-sm font-semibold text-slate-900">{formatDate(ownerPayable?.paid_at ?? null)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
