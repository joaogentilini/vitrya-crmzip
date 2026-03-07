import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingRelationError, isUniqueViolation, toMessage } from '@/lib/finance/errors'

type AdminClient = ReturnType<typeof createAdminClient>

type RentCycleStatus = 'open' | 'received' | 'owner_paid' | 'cancelled'

type DealRow = {
  id: string
  property_id: string | null
  owner_user_id: string | null
  operation_type: string | null
  status: string | null
  gross_value: number | null
}

type PropertyRow = {
  id: string
  title: string | null
  rent_price: number | null
  owner_client_id: string | null
  property_category_id: string | null
  business_line_id: string | null
}

type CycleRow = {
  id: string
  deal_id: string
  competence_month: string
  status: string | null
  receivable_id: string | null
  owner_payable_id: string | null
  broker_payable_id: string | null
}

type BusinessLineRow = {
  id: string
  code: string
}

type CategoryMap = {
  rentRevenueInId: string | null
  ownerPayoutOutId: string | null
  brokerPayoutOutId: string | null
}

type CommissionConfig = {
  recurringPercent: number
  brokerSplitPercent: number
  partnerSplitPercent: number
}

export type GenerateRentCycleResult =
  | {
      ok: true
      cycleId: string
      status: RentCycleStatus
      alreadyExists: boolean
      createdReceivable: boolean
      createdOwnerPayable: boolean
      createdBrokerPayable: boolean
    }
  | { ok: false; error: string }

export type ConfirmRentCycleReceiptResult =
  | { ok: true; cycleId: string; status: RentCycleStatus; receivablePaid: boolean }
  | { ok: false; error: string }

export type MarkRentCycleOwnerPaidResult =
  | { ok: true; cycleId: string; status: RentCycleStatus; ownerPayablePaid: boolean }
  | { ok: false; error: string }

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeMonth(value: string | null | undefined): string {
  const raw = String(value || '').trim()
  if (/^\d{4}-\d{2}$/.test(raw)) return raw
  return new Date().toISOString().slice(0, 7)
}

function monthStart(month: string): string {
  return `${month}-01`
}

function normalizeDay(value: number | null | undefined, fallback = 10): number {
  const base = Number.isFinite(Number(value)) ? Number(value) : fallback
  return Math.max(1, Math.min(28, Math.trunc(base)))
}

function buildDueDate(month: string, day: number): string {
  return `${month}-${String(normalizeDay(day)).padStart(2, '0')}`
}

function inferOpenStatus(dueDate: string): 'open' | 'overdue' {
  const today = new Date().toISOString().slice(0, 10)
  return dueDate < today ? 'overdue' : 'open'
}

function normalizeCycleStatus(value: string | null): RentCycleStatus {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'received') return 'received'
  if (normalized === 'owner_paid') return 'owner_paid'
  if (normalized === 'cancelled') return 'cancelled'
  return 'open'
}

async function loadCategoryMap(admin: AdminClient): Promise<CategoryMap> {
  const { data } = await admin
    .from('financial_categories')
    .select('id, code, direction')
    .in('code', ['rent_revenue', 'owner_payout', 'broker_payout'])

  const rows = (data ?? []) as Array<{ id: string; code: string; direction: 'in' | 'out' }>
  const map: CategoryMap = {
    rentRevenueInId: null,
    ownerPayoutOutId: null,
    brokerPayoutOutId: null,
  }

  for (const row of rows) {
    if (row.code === 'rent_revenue' && row.direction === 'in') map.rentRevenueInId = row.id
    if (row.code === 'owner_payout' && row.direction === 'out') map.ownerPayoutOutId = row.id
    if (row.code === 'broker_payout' && row.direction === 'out') map.brokerPayoutOutId = row.id
  }

  return map
}

async function loadBusinessLineMap(admin: AdminClient): Promise<{
  byId: Map<string, BusinessLineRow>
  rentId: string | null
}> {
  const { data } = await admin.from('business_lines').select('id, code')
  const rows = (data ?? []) as BusinessLineRow[]

  const byId = new Map<string, BusinessLineRow>()
  let rentId: string | null = null
  for (const row of rows) {
    byId.set(row.id, row)
    if (row.code === 'rent') rentId = row.id
  }

  return { byId, rentId }
}

async function loadCommissionConfig(admin: AdminClient, propertyId: string): Promise<CommissionConfig> {
  const settingsRes = await admin
    .from('property_commission_settings')
    .select('rent_recurring_commission_percent, rent_initial_commission_percent, rent_broker_split_percent, rent_partner_split_percent')
    .eq('property_id', propertyId)
    .maybeSingle()

  if (settingsRes.error) {
    if (isMissingRelationError(settingsRes.error)) {
      return {
        recurringPercent: 8,
        brokerSplitPercent: 50,
        partnerSplitPercent: 0,
      }
    }
    return {
      recurringPercent: 8,
      brokerSplitPercent: 50,
      partnerSplitPercent: 0,
    }
  }

  const data = (settingsRes.data ?? {}) as Record<string, unknown>
  const recurring = toNumber(data.rent_recurring_commission_percent)
  const initial = toNumber(data.rent_initial_commission_percent)
  const brokerSplit = toNumber(data.rent_broker_split_percent)
  const partnerSplit = toNumber(data.rent_partner_split_percent)

  return {
    recurringPercent: recurring > 0 ? recurring : initial > 0 ? initial : 8,
    brokerSplitPercent: brokerSplit > 0 ? brokerSplit : 50,
    partnerSplitPercent: partnerSplit > 0 ? partnerSplit : 0,
  }
}

async function loadDealAndProperty(admin: AdminClient, dealId: string) {
  const dealRes = await admin
    .from('deals')
    .select('id, property_id, owner_user_id, operation_type, status, gross_value')
    .eq('id', dealId)
    .maybeSingle()

  if (dealRes.error || !dealRes.data) {
    return { ok: false as const, error: toMessage(dealRes.error, 'Deal nao encontrado.') }
  }

  const deal = dealRes.data as DealRow
  if (String(deal.status || '') !== 'confirmed') {
    return { ok: false as const, error: 'Somente deals confirmados podem gerar ciclo de locacao.' }
  }
  if (String(deal.operation_type || '') !== 'rent') {
    return { ok: false as const, error: 'Este deal nao e do tipo locacao.' }
  }
  if (!deal.property_id) {
    return { ok: false as const, error: 'Deal sem property_id para ciclo de locacao.' }
  }

  const propertyRes = await admin
    .from('properties')
    .select('id, title, rent_price, owner_client_id, property_category_id, business_line_id')
    .eq('id', deal.property_id)
    .maybeSingle()

  if (propertyRes.error || !propertyRes.data) {
    return { ok: false as const, error: toMessage(propertyRes.error, 'Imovel nao encontrado para o deal de locacao.') }
  }

  return { ok: true as const, deal, property: propertyRes.data as PropertyRow }
}

async function readCycle(admin: AdminClient, cycleId: string): Promise<CycleRow | null> {
  const res = await admin
    .from('deal_rent_cycles')
    .select('id, deal_id, competence_month, status, receivable_id, owner_payable_id, broker_payable_id')
    .eq('id', cycleId)
    .maybeSingle()

  if (res.error || !res.data) return null
  return res.data as CycleRow
}

export async function generateDealRentCycle(params: {
  dealId: string
  competenceMonth?: string | null
  dueDay?: number | null
  actorUserId: string | null
}): Promise<GenerateRentCycleResult> {
  const admin = createAdminClient()
  const month = normalizeMonth(params.competenceMonth)
  const competenceMonthDate = monthStart(month)
  const dueDate = buildDueDate(month, params.dueDay ?? 10)

  const context = await loadDealAndProperty(admin, params.dealId)
  if (!context.ok) return context

  const { deal, property } = context
  const rentAmount = roundMoney(Math.max(toNumber(property.rent_price), toNumber(deal.gross_value), 0))
  if (rentAmount <= 0) {
    return { ok: false, error: 'Valor de aluguel nao configurado no imovel/deal.' }
  }

  const existingCycleRes = await admin
    .from('deal_rent_cycles')
    .select('id, status')
    .eq('deal_id', deal.id)
    .eq('competence_month', competenceMonthDate)
    .maybeSingle()

  if (existingCycleRes.error && !isMissingRelationError(existingCycleRes.error)) {
    return { ok: false, error: existingCycleRes.error.message || 'Erro ao validar ciclo mensal de locacao.' }
  }

  if (existingCycleRes.error && isMissingRelationError(existingCycleRes.error)) {
    return {
      ok: false,
      error: 'Tabela deal_rent_cycles nao encontrada. Aplique a migration 202603061030_deal_rent_cycles_mvp.sql.',
    }
  }

  if (existingCycleRes.data?.id) {
    return {
      ok: true,
      cycleId: String(existingCycleRes.data.id),
      status: normalizeCycleStatus(String(existingCycleRes.data.status || 'open')),
      alreadyExists: true,
      createdReceivable: false,
      createdOwnerPayable: false,
      createdBrokerPayable: false,
    }
  }

  const lines = await loadBusinessLineMap(admin)
  const categories = await loadCategoryMap(admin)
  const commissionConfig = await loadCommissionConfig(admin, property.id)

  const recurringPercent = Math.max(commissionConfig.recurringPercent, 0)
  const brokerSplit = Math.max(commissionConfig.brokerSplitPercent, 0)
  const partnerSplit = Math.max(commissionConfig.partnerSplitPercent, 0)
  const totalCommission = roundMoney((rentAmount * recurringPercent) / 100)
  const brokerCommission = roundMoney((totalCommission * brokerSplit) / 100)
  const partnerCommission = roundMoney((totalCommission * partnerSplit) / 100)
  const companyCommission = roundMoney(totalCommission - brokerCommission - partnerCommission)
  const ownerNetAmount = roundMoney(Math.max(rentAmount - totalCommission, 0))

  let businessLineId: string | null = null
  if (property.business_line_id && lines.byId.get(property.business_line_id)?.code === 'rent') {
    businessLineId = property.business_line_id
  } else {
    businessLineId = lines.rentId
  }

  const cycleInsertRes = await admin
    .from('deal_rent_cycles')
    .insert({
      deal_id: deal.id,
      property_id: property.id,
      broker_user_id: deal.owner_user_id,
      owner_person_id: property.owner_client_id,
      business_line_id: businessLineId,
      competence_month: competenceMonthDate,
      due_date: dueDate,
      rent_amount: rentAmount,
      commission_total: totalCommission,
      broker_commission: brokerCommission,
      partner_commission: partnerCommission,
      company_commission: companyCommission,
      owner_net_amount: ownerNetAmount,
      status: 'open',
      metadata: {
        source: 'phase7_locacao_mvp',
        recurring_percent: recurringPercent,
        broker_split_percent: brokerSplit,
        partner_split_percent: partnerSplit,
      },
      created_by: params.actorUserId,
    })
    .select('id')
    .maybeSingle()

  if (cycleInsertRes.error || !cycleInsertRes.data?.id) {
    if (isUniqueViolation(cycleInsertRes.error)) {
      const conflictRes = await admin
        .from('deal_rent_cycles')
        .select('id, status')
        .eq('deal_id', deal.id)
        .eq('competence_month', competenceMonthDate)
        .maybeSingle()

      if (conflictRes.data?.id) {
        return {
          ok: true,
          cycleId: String(conflictRes.data.id),
          status: normalizeCycleStatus(String(conflictRes.data.status || 'open')),
          alreadyExists: true,
          createdReceivable: false,
          createdOwnerPayable: false,
          createdBrokerPayable: false,
        }
      }
    }

    return { ok: false, error: toMessage(cycleInsertRes.error, 'Erro ao criar ciclo mensal de locacao.') }
  }

  const cycleId = String(cycleInsertRes.data.id)
  const receivableStatus = inferOpenStatus(dueDate)
  let receivableId: string | null = null
  let ownerPayableId: string | null = null
  let brokerPayableId: string | null = null

  const receivableRes = await admin
    .from('receivables')
    .insert({
      title: `Aluguel - ${property.title || property.id.slice(0, 8)} - ${month}`,
      amount_total: rentAmount,
      amount_open: rentAmount,
      due_date: dueDate,
      status: receivableStatus,
      business_line_id: businessLineId,
      property_id: property.id,
      property_category_id: property.property_category_id,
      broker_user_id: deal.owner_user_id,
      financial_category_id: categories.rentRevenueInId,
      origin_type: 'deal_rent_cycle',
      origin_id: cycleId,
      created_by: params.actorUserId,
      metadata: {
        deal_id: deal.id,
        competence_month: competenceMonthDate,
      },
    })
    .select('id')
    .maybeSingle()

  if (receivableRes.error || !receivableRes.data?.id) {
    return { ok: false, error: toMessage(receivableRes.error, 'Erro ao criar conta a receber da locacao.') }
  }
  receivableId = String(receivableRes.data.id)

  if (ownerNetAmount > 0) {
    const ownerPayableRes = await admin
      .from('payables')
      .insert({
        title: `Repasse proprietario - ${property.title || property.id.slice(0, 8)} - ${month}`,
        amount_total: ownerNetAmount,
        amount_open: ownerNetAmount,
        due_date: dueDate,
        status: receivableStatus,
        business_line_id: businessLineId,
        property_id: property.id,
        property_category_id: property.property_category_id,
        broker_user_id: deal.owner_user_id,
        beneficiary_person_id: property.owner_client_id,
        financial_category_id: categories.ownerPayoutOutId,
        origin_type: 'deal_rent_cycle_owner',
        origin_id: cycleId,
        created_by: params.actorUserId,
        metadata: {
          deal_id: deal.id,
          competence_month: competenceMonthDate,
        },
      })
      .select('id')
      .maybeSingle()

    if (ownerPayableRes.error || !ownerPayableRes.data?.id) {
      return { ok: false, error: toMessage(ownerPayableRes.error, 'Erro ao criar payable de repasse do proprietario.') }
    }
    ownerPayableId = String(ownerPayableRes.data.id)
  }

  if (brokerCommission > 0 && deal.owner_user_id) {
    const brokerPayableRes = await admin
      .from('payables')
      .insert({
        title: `Comissao locacao corretor - ${property.title || property.id.slice(0, 8)} - ${month}`,
        amount_total: brokerCommission,
        amount_open: brokerCommission,
        due_date: dueDate,
        status: receivableStatus,
        business_line_id: businessLineId,
        property_id: property.id,
        property_category_id: property.property_category_id,
        broker_user_id: deal.owner_user_id,
        financial_category_id: categories.brokerPayoutOutId,
        origin_type: 'deal_rent_cycle_broker',
        origin_id: cycleId,
        created_by: params.actorUserId,
        metadata: {
          deal_id: deal.id,
          competence_month: competenceMonthDate,
        },
      })
      .select('id')
      .maybeSingle()

    if (brokerPayableRes.error || !brokerPayableRes.data?.id) {
      return { ok: false, error: toMessage(brokerPayableRes.error, 'Erro ao criar payable de comissao do corretor.') }
    }
    brokerPayableId = String(brokerPayableRes.data.id)
  }

  await admin
    .from('deal_rent_cycles')
    .update({
      receivable_id: receivableId,
      owner_payable_id: ownerPayableId,
      broker_payable_id: brokerPayableId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cycleId)

  return {
    ok: true,
    cycleId,
    status: 'open',
    alreadyExists: false,
    createdReceivable: Boolean(receivableId),
    createdOwnerPayable: Boolean(ownerPayableId),
    createdBrokerPayable: Boolean(brokerPayableId),
  }
}

export async function confirmRentCycleReceipt(params: {
  cycleId: string
  actorUserId: string | null
}): Promise<ConfirmRentCycleReceiptResult> {
  const admin = createAdminClient()
  const cycle = await readCycle(admin, params.cycleId)
  if (!cycle) {
    return { ok: false, error: 'Ciclo de locacao nao encontrado.' }
  }

  const currentStatus = normalizeCycleStatus(cycle.status)
  if (currentStatus === 'cancelled') {
    return { ok: false, error: 'Ciclo cancelado nao pode ser confirmado.' }
  }

  let receivablePaid = false
  if (cycle.receivable_id) {
    const receivableRes = await admin
      .from('receivables')
      .select('id, status')
      .eq('id', cycle.receivable_id)
      .maybeSingle()

    if (receivableRes.error || !receivableRes.data?.id) {
      return { ok: false, error: toMessage(receivableRes.error, 'Receivable do ciclo nao encontrado.') }
    }

    const receivableStatus = String(receivableRes.data.status || '').toLowerCase()
    if (receivableStatus !== 'paid') {
      const nowIso = new Date().toISOString()
      const updateRes = await admin
        .from('receivables')
        .update({
          status: 'paid',
          amount_open: 0,
          paid_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', cycle.receivable_id)

      if (updateRes.error) {
        return { ok: false, error: toMessage(updateRes.error, 'Erro ao marcar recebimento do ciclo.') }
      }
      receivablePaid = true
    }
  } else {
    return { ok: false, error: 'Ciclo sem receivable vinculado. Gere novamente o ciclo.' }
  }

  const nextStatus: RentCycleStatus = currentStatus === 'owner_paid' ? 'owner_paid' : 'received'
  if (currentStatus !== nextStatus) {
    const updateCycleRes = await admin
      .from('deal_rent_cycles')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cycle.id)

    if (updateCycleRes.error) {
      return { ok: false, error: toMessage(updateCycleRes.error, 'Erro ao atualizar status do ciclo.') }
    }
  }

  return { ok: true, cycleId: cycle.id, status: nextStatus, receivablePaid }
}

export async function markRentCycleOwnerPaid(params: {
  cycleId: string
  actorUserId: string | null
}): Promise<MarkRentCycleOwnerPaidResult> {
  const admin = createAdminClient()
  const cycle = await readCycle(admin, params.cycleId)
  if (!cycle) {
    return { ok: false, error: 'Ciclo de locacao nao encontrado.' }
  }

  const currentStatus = normalizeCycleStatus(cycle.status)
  if (currentStatus === 'cancelled') {
    return { ok: false, error: 'Ciclo cancelado nao pode receber repasse.' }
  }
  if (currentStatus === 'open') {
    return { ok: false, error: 'Confirme o recebimento do aluguel antes do repasse ao proprietario.' }
  }

  if (!cycle.owner_payable_id) {
    return { ok: false, error: 'Ciclo sem payable de proprietario vinculado.' }
  }

  const payableRes = await admin
    .from('payables')
    .select('id, status')
    .eq('id', cycle.owner_payable_id)
    .maybeSingle()

  if (payableRes.error || !payableRes.data?.id) {
    return { ok: false, error: toMessage(payableRes.error, 'Payable de repasse nao encontrado.') }
  }

  let ownerPayablePaid = false
  const payableStatus = String(payableRes.data.status || '').toLowerCase()
  if (payableStatus !== 'paid') {
    const nowIso = new Date().toISOString()
    const payableUpdateRes = await admin
      .from('payables')
      .update({
        status: 'paid',
        amount_open: 0,
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', cycle.owner_payable_id)

    if (payableUpdateRes.error) {
      return { ok: false, error: toMessage(payableUpdateRes.error, 'Erro ao marcar repasse do proprietario como pago.') }
    }
    ownerPayablePaid = true
  }

  if (currentStatus !== 'owner_paid') {
    const cycleUpdateRes = await admin
      .from('deal_rent_cycles')
      .update({
        status: 'owner_paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', cycle.id)

    if (cycleUpdateRes.error) {
      return { ok: false, error: toMessage(cycleUpdateRes.error, 'Erro ao atualizar status final do ciclo.') }
    }
  }

  return { ok: true, cycleId: cycle.id, status: 'owner_paid', ownerPayablePaid }
}
