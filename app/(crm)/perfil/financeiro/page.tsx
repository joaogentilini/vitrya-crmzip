export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import { isMissingRelationError } from '@/lib/finance/errors'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function toMoney(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toStatusLabel(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized === 'payable') return 'A pagar'
  if (normalized === 'paid') return 'Paga'
  return 'Aguardando recebimento'
}

export default async function PerfilFinanceiroPage() {
  const profile = await requireRole(['admin', 'gestor', 'corretor'])
  const supabase = await createClient()
  const isManager = profile.role === 'admin' || profile.role === 'gestor'

  let snapshotQuery = supabase
    .from('deal_commission_snapshots')
    .select(
      'id, deal_id, property_id, broker_user_id, gross_value, total_commission_value, broker_commission_value, company_commission_value, partner_commission_value, status, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(400)

  if (!isManager) {
    snapshotQuery = snapshotQuery.eq('broker_user_id', profile.id)
  }

  const snapshotsRes = await snapshotQuery
  if (snapshotsRes.error) {
    if (isMissingRelationError(snapshotsRes.error)) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Meu Financeiro</h1>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            O modulo de comissoes por deal ainda nao foi migrado neste banco.
          </p>
        </div>
      )
    }

    throw new Error(snapshotsRes.error.message || 'Erro ao carregar comissoes do corretor.')
  }

  const snapshots = (snapshotsRes.data ?? []) as Array<{
    id: string
    deal_id: string
    property_id: string
    broker_user_id: string | null
    gross_value: number | null
    total_commission_value: number | null
    broker_commission_value: number | null
    company_commission_value: number | null
    partner_commission_value: number | null
    status: string | null
    created_at: string | null
  }>

  const dealIds = Array.from(new Set(snapshots.map((item) => item.deal_id).filter(Boolean)))
  const propertyIds = Array.from(new Set(snapshots.map((item) => item.property_id).filter(Boolean)))

  const [dealRowsRes, propertyRowsRes, receivableRowsRes] = await Promise.all([
    dealIds.length > 0
      ? supabase.from('deals').select('id, closed_at, status').in('id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length > 0
      ? supabase.from('properties').select('id, title').in('id', propertyIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length > 0
      ? supabase.from('receivables').select('id, origin_id, status').eq('origin_type', 'deal').in('origin_id', dealIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const dealMap = new Map(
    ((dealRowsRes.data ?? []) as Array<{ id: string; closed_at: string | null; status: string | null }>).map((row) => [
      row.id,
      row,
    ])
  )
  const propertyMap = new Map(((propertyRowsRes.data ?? []) as Array<{ id: string; title: string | null }>).map((row) => [row.id, row]))
  const receivableMap = new Map(
    ((receivableRowsRes.data ?? []) as Array<{ id: string; origin_id: string | null; status: string | null }>)
      .filter((row) => !!row.origin_id)
      .map((row) => [String(row.origin_id), row])
  )

  const expectedBroker = snapshots.reduce((acc, item) => acc + Math.max(toMoney(item.broker_commission_value), 0), 0)
  const waitingCount = snapshots.filter((item) => String(item.status || '').toLowerCase() === 'waiting_receipt').length
  const payableCount = snapshots.filter((item) => String(item.status || '').toLowerCase() === 'payable').length
  const paidCount = snapshots.filter((item) => String(item.status || '').toLowerCase() === 'paid').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{isManager ? 'Comissoes por Deal' : 'Meu Financeiro'}</h1>
          <p className="text-sm text-slate-600">
            Comissao prevista no fechamento, com progressao: aguardando recebimento - a pagar - paga.
          </p>
        </div>
        <Link
          href="/erp/financeiro"
          className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Abrir ERP Financeiro
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase text-slate-500">Comissao prevista</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(expectedBroker)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase text-slate-500">Aguardando recebimento</div>
          <div className="mt-1 text-xl font-bold text-amber-700">{waitingCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase text-slate-500">A pagar</div>
          <div className="mt-1 text-xl font-bold text-indigo-700">{payableCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase text-slate-500">Pagas</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">{paidCount}</div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Carteira de comissoes por fechamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshots.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Nenhuma comissao encontrada para o filtro atual.
            </p>
          ) : null}

          {snapshots.map((snapshot) => {
            const deal = dealMap.get(snapshot.deal_id)
            const property = propertyMap.get(snapshot.property_id)
            const receivable = receivableMap.get(snapshot.deal_id)
            const status = String(snapshot.status || 'waiting_receipt')

            return (
              <div key={snapshot.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{property?.title || `Imovel ${snapshot.property_id.slice(0, 8)}`}</div>
                    <div className="text-xs text-slate-500">
                      Deal {snapshot.deal_id.slice(0, 8)} - Fechado em{' '}
                      {deal?.closed_at ? new Date(deal.closed_at).toLocaleDateString('pt-BR') : '-'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{toStatusLabel(status)}</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                      Recebivel: {receivable?.status || 'nao gerado'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div>Valor do negocio</div>
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(Math.max(toMoney(snapshot.gross_value), 0))}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div>Comissao total</div>
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(Math.max(toMoney(snapshot.total_commission_value), 0))}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div>Comissao corretor</div>
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(Math.max(toMoney(snapshot.broker_commission_value), 0))}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div>Criado em</div>
                    <div className="text-sm font-bold text-slate-900">
                      {snapshot.created_at ? new Date(snapshot.created_at).toLocaleDateString('pt-BR') : '-'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
