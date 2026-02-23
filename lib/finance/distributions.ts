import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingRelationError, isUniqueViolation, toMessage } from '@/lib/finance/errors'
import type { BusinessLineCode, FinanceSettingsRow } from '@/lib/finance/types'

type AdminClient = ReturnType<typeof createAdminClient>

type ProposalRow = {
  id: string
  title: string | null
  status: string | null
  approved_at: string | null
  property_id: string | null
  person_id: string | null
  lead_id: string | null
  lead_type_id: string | null
  lead_interest_id: string | null
  lead_source_id: string | null
  property_category_id: string | null
  broker_seller_profile_id: string | null
  broker_buyer_profile_id: string | null
  business_line_id: string | null
  commission_percent: number | null
  commission_value: number | null
  broker_commission_value: number | null
  partner_commission_value: number | null
  company_commission_value: number | null
  owner_net_value: number | null
  source_type: string | null
}

type PropertyRow = {
  id: string
  title: string | null
  purpose: string | null
  business_line_id: string | null
  property_category_id: string | null
  owner_user_id: string | null
  owner_client_id: string | null
}

type ProposalPaymentRow = {
  id: string
  proposal_id: string
  method: string | null
  proposal_payment_method_id: string | null
  amount: number | null
  due_date: string | null
  details: string | null
}

type BusinessLineMap = {
  byId: Map<string, { id: string; code: BusinessLineCode | string; name: string }>
  saleId: string | null
  rentId: string | null
}

type CategoryMap = {
  saleRevenueInId: string | null
  rentRevenueInId: string | null
  brokerPayoutOutId: string | null
  ownerPayoutOutId: string | null
  bankFeeOutId: string | null
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeMethodCode(value: string | null): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized) return 'pix'
  if (normalized.includes('pix')) return 'pix'
  if (normalized.includes('boleto')) return 'boleto'
  if (normalized.includes('ted') || normalized.includes('transfer')) return 'ted'
  if (normalized.includes('cart') || normalized.includes('credito')) return 'card_credit'
  if (normalized.includes('dinhe') || normalized.includes('cash')) return 'cash'
  return normalized
}

function lineCodeFromPurpose(value: string | null): BusinessLineCode {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('alugu') || normalized.includes('rent') || normalized.includes('loca')) return 'rent'
  return 'sale'
}

async function loadBusinessLines(admin: AdminClient): Promise<BusinessLineMap> {
  const { data } = await admin.from('business_lines').select('id, code, name')
  const rows = (data ?? []) as Array<{ id: string; code: string; name: string }>

  const byId = new Map<string, { id: string; code: string; name: string }>()
  let saleId: string | null = null
  let rentId: string | null = null

  for (const row of rows) {
    byId.set(row.id, row)
    if (row.code === 'sale') saleId = row.id
    if (row.code === 'rent') rentId = row.id
  }

  return { byId, saleId, rentId }
}

async function loadCategoryMap(admin: AdminClient): Promise<CategoryMap> {
  const { data } = await admin
    .from('financial_categories')
    .select('id, code, direction')
    .in('code', ['sale_revenue', 'rent_revenue', 'broker_payout', 'owner_payout', 'bank_fee'])

  const rows = (data ?? []) as Array<{ id: string; code: string; direction: 'in' | 'out' }>
  const map: CategoryMap = {
    saleRevenueInId: null,
    rentRevenueInId: null,
    brokerPayoutOutId: null,
    ownerPayoutOutId: null,
    bankFeeOutId: null,
  }

  for (const row of rows) {
    if (row.code === 'sale_revenue' && row.direction === 'in') map.saleRevenueInId = row.id
    if (row.code === 'rent_revenue' && row.direction === 'in') map.rentRevenueInId = row.id
    if (row.code === 'broker_payout' && row.direction === 'out') map.brokerPayoutOutId = row.id
    if (row.code === 'owner_payout' && row.direction === 'out') map.ownerPayoutOutId = row.id
    if (row.code === 'bank_fee' && row.direction === 'out') map.bankFeeOutId = row.id
  }

  return map
}

async function loadPaymentMethodMap(admin: AdminClient): Promise<Map<string, string>> {
  const { data } = await admin.from('payment_methods').select('id, code')
  const rows = (data ?? []) as Array<{ id: string; code: string }>
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.code, row.id)
  }
  return map
}

function dueStatusForDate(dueDate: string): 'open' | 'overdue' {
  const today = todayIsoDate()
  return dueDate < today ? 'overdue' : 'open'
}

function pickBusinessLineId(params: {
  proposal: ProposalRow
  property: PropertyRow | null
  lines: BusinessLineMap
}): string | null {
  if (params.proposal.business_line_id) return params.proposal.business_line_id
  if (params.property?.business_line_id) return params.property.business_line_id

  if (params.proposal.source_type === 'incorporation_unit') return params.lines.saleId
  if (params.property?.purpose) {
    const code = lineCodeFromPurpose(params.property.purpose)
    return code === 'rent' ? params.lines.rentId : params.lines.saleId
  }

  return params.lines.saleId
}

function lineCodeById(lineId: string | null, lines: BusinessLineMap): BusinessLineCode {
  if (lineId) {
    const row = lines.byId.get(lineId)
    if (row?.code === 'rent') return 'rent'
  }
  return 'sale'
}

export async function ensureReceivablesForProposal(params: { proposalId: string; actorUserId: string | null }) {
  const admin = createAdminClient()

  const proposalRes = await admin
    .from('property_proposals')
    .select(
      'id, title, status, approved_at, property_id, person_id, lead_id, lead_type_id, lead_interest_id, lead_source_id, property_category_id, broker_seller_profile_id, broker_buyer_profile_id, business_line_id, commission_percent, commission_value, broker_commission_value, partner_commission_value, company_commission_value, owner_net_value, source_type'
    )
    .eq('id', params.proposalId)
    .maybeSingle()

  if (proposalRes.error || !proposalRes.data) {
    return { ok: false as const, error: toMessage(proposalRes.error, 'Proposta não encontrada para dual-write.') }
  }

  const proposal = proposalRes.data as ProposalRow
  if (proposal.status !== 'approved') {
    return { ok: true as const, skipped: true, reason: 'proposal_not_approved' }
  }

  let property: PropertyRow | null = null
  if (proposal.property_id) {
    const propertyRes = await admin
      .from('properties')
      .select('id, title, purpose, business_line_id, property_category_id, owner_user_id, owner_client_id')
      .eq('id', proposal.property_id)
      .maybeSingle()
    property = (propertyRes.data ?? null) as PropertyRow | null
  }

  const lines = await loadBusinessLines(admin)
  const lineId = pickBusinessLineId({ proposal, property, lines })
  const lineCode = lineCodeById(lineId, lines)

  if (lineId && !proposal.business_line_id) {
    await admin.from('property_proposals').update({ business_line_id: lineId }).eq('id', proposal.id)
    await admin
      .from('broker_commission_payments')
      .update({ business_line_id: lineId })
      .eq('proposal_id', proposal.id)
      .is('business_line_id', null)
  }

  const paymentsRes = await admin
    .from('property_proposal_payments')
    .select('id, proposal_id, method, proposal_payment_method_id, amount, due_date, details')
    .eq('proposal_id', proposal.id)
    .order('created_at', { ascending: true })

  if (paymentsRes.error) {
    if (isMissingRelationError(paymentsRes.error)) {
      return { ok: true as const, skipped: true, reason: 'property_proposal_payments_missing' }
    }
    return { ok: false as const, error: paymentsRes.error.message || 'Erro ao carregar pagamentos da proposta.' }
  }

  const paymentRows = (paymentsRes.data ?? []) as ProposalPaymentRow[]
  if (paymentRows.length === 0) {
    return { ok: true as const, skipped: true, reason: 'proposal_without_payments' }
  }

  const categoryMap = await loadCategoryMap(admin)
  const paymentMethodMap = await loadPaymentMethodMap(admin)
  const receivableCategoryId = lineCode === 'rent' ? categoryMap.rentRevenueInId : categoryMap.saleRevenueInId

  let created = 0
  let updated = 0
  const nowIso = new Date().toISOString()

  for (const row of paymentRows) {
    const dueDate = row.due_date || todayIsoDate()
    const amount = Math.max(toNumber(row.amount), 0)
    const normalizedMethodCode = normalizeMethodCode(row.method)
    const existingRes = await admin
      .from('receivables')
      .select('id, status')
      .eq('origin_type', 'property_proposal_payment')
      .eq('origin_id', row.id)
      .maybeSingle()

    const payload: Record<string, unknown> = {
      title: proposal.title
        ? `Proposta ${proposal.title} - ${String(row.method || 'pagamento')}`
        : `Proposta ${proposal.id.slice(0, 8)} - ${String(row.method || 'pagamento')}`,
      amount_total: amount,
      amount_open: amount,
      due_date: dueDate,
      status: dueStatusForDate(dueDate),
      business_line_id: lineId,
      property_id: proposal.property_id,
      property_category_id: proposal.property_category_id ?? property?.property_category_id ?? null,
      lead_id: proposal.lead_id ?? null,
      lead_type_id: proposal.lead_type_id ?? null,
      lead_interest_id: proposal.lead_interest_id ?? null,
      lead_source_id: proposal.lead_source_id ?? null,
      broker_user_id: proposal.broker_buyer_profile_id || proposal.broker_seller_profile_id || property?.owner_user_id || null,
      financial_category_id: receivableCategoryId,
      proposal_payment_method_id: row.proposal_payment_method_id ?? null,
      payment_method_id: paymentMethodMap.get(normalizedMethodCode) ?? null,
      origin_type: 'property_proposal_payment',
      origin_id: row.id,
      created_by: params.actorUserId,
      updated_at: nowIso,
      metadata: {
        proposal_id: proposal.id,
        proposal_payment_method: row.method,
        proposal_payment_details: row.details,
      },
    }

    if (existingRes.error) {
      return { ok: false as const, error: existingRes.error.message || 'Erro ao validar receivable legado.' }
    }

    if (existingRes.data?.id) {
      const existingStatus = String(existingRes.data.status || '')
      if (existingStatus === 'paid' || existingStatus === 'canceled') continue
      const { error: updateError } = await admin.from('receivables').update(payload).eq('id', existingRes.data.id)
      if (updateError) {
        return { ok: false as const, error: updateError.message || 'Erro ao atualizar conta a receber.' }
      }
      updated += 1
      continue
    }

    const { error: insertError } = await admin.from('receivables').insert(payload)
    if (insertError) {
      return { ok: false as const, error: insertError.message || 'Erro ao criar conta a receber.' }
    }
    created += 1
  }

  return {
    ok: true as const,
    created,
    updated,
    proposalId: proposal.id,
    businessLineId: lineId,
    businessLineCode: lineCode,
  }
}

type DistributionResult =
  | { ok: true; distributionId: string; createdPayables: number; alreadyGenerated?: boolean }
  | { ok: false; error: string }

async function resolveProposalFromReceivable(admin: AdminClient, receivable: { origin_type: string; origin_id: string | null }) {
  if (!receivable.origin_id) return null

  if (receivable.origin_type === 'property_proposal') return receivable.origin_id

  if (receivable.origin_type === 'property_proposal_payment') {
    const paymentRes = await admin
      .from('property_proposal_payments')
      .select('proposal_id')
      .eq('id', receivable.origin_id)
      .maybeSingle()
    if (!paymentRes.error) {
      const proposalId = String(paymentRes.data?.proposal_id || '')
      return proposalId || null
    }
  }

  return null
}

export async function generateDistributionForPayment(params: {
  paymentId: string
  actorUserId: string | null
}): Promise<DistributionResult> {
  const admin = createAdminClient()

  const paymentRes = await admin
    .from('payments')
    .select('*')
    .eq('id', params.paymentId)
    .maybeSingle()

  if (paymentRes.error || !paymentRes.data) {
    return { ok: false, error: toMessage(paymentRes.error, 'Pagamento não encontrado.') }
  }

  const payment = paymentRes.data as Record<string, unknown>
  if (String(payment.direction || '') !== 'in') {
    return { ok: false, error: 'A distribuição manual só é permitida para pagamentos de entrada.' }
  }
  if (String(payment.status || '') !== 'confirmed') {
    return { ok: false, error: 'Pagamento ainda não está confirmado.' }
  }

  const existingDistributionRes = await admin
    .from('finance_distributions')
    .select('id, status')
    .eq('payment_id', params.paymentId)
    .maybeSingle()

  if (!existingDistributionRes.error && existingDistributionRes.data?.id) {
    const existingStatus = String(existingDistributionRes.data.status || '')
    if (existingStatus !== 'reverted') {
      return {
        ok: true,
        distributionId: existingDistributionRes.data.id,
        createdPayables: 0,
        alreadyGenerated: true,
      }
    }
    return { ok: false, error: 'Pagamento possui distribuição revertida. Use novo pagamento para reaplicar.' }
  }

  const receivableId = String(payment.receivable_id || '')
  if (!receivableId) return { ok: false, error: 'Pagamento sem receivable vinculado.' }

  const receivableRes = await admin
    .from('receivables')
    .select('*')
    .eq('id', receivableId)
    .maybeSingle()

  if (receivableRes.error || !receivableRes.data) {
    return { ok: false, error: toMessage(receivableRes.error, 'Receivable não encontrado para distribuição.') }
  }

  const receivable = receivableRes.data as Record<string, unknown>
  const lines = await loadBusinessLines(admin)
  const lineId = String(payment.business_line_id || receivable.business_line_id || '') || null
  const lineCode = lineCodeById(lineId, lines)

  const proposalId = await resolveProposalFromReceivable(admin, {
    origin_type: String(receivable.origin_type || ''),
    origin_id: (receivable.origin_id ? String(receivable.origin_id) : null) || null,
  })

  let proposal: ProposalRow | null = null
  if (proposalId) {
    const proposalRes = await admin
      .from('property_proposals')
      .select(
        'id, title, status, approved_at, property_id, person_id, lead_id, lead_type_id, lead_interest_id, lead_source_id, property_category_id, broker_seller_profile_id, broker_buyer_profile_id, business_line_id, commission_percent, commission_value, broker_commission_value, partner_commission_value, company_commission_value, owner_net_value, source_type'
      )
      .eq('id', proposalId)
      .maybeSingle()
    if (!proposalRes.error && proposalRes.data) proposal = proposalRes.data as ProposalRow
  }

  let property: PropertyRow | null = null
  const propertyId = String(receivable.property_id || proposal?.property_id || '') || null
  if (propertyId) {
    const propertyRes = await admin
      .from('properties')
      .select('id, title, purpose, business_line_id, property_category_id, owner_user_id, owner_client_id')
      .eq('id', propertyId)
      .maybeSingle()
    if (!propertyRes.error && propertyRes.data) property = propertyRes.data as PropertyRow
  }

  const amount = Math.max(toNumber(payment.amount), 0)
  const brokerAmount = Math.max(toNumber(proposal?.broker_commission_value), 0)
  const partnerAmount = Math.max(toNumber(proposal?.partner_commission_value), 0)
  const ownerFromProposal = Math.max(toNumber(proposal?.owner_net_value), 0)
  const ownerAmount = ownerFromProposal > 0 ? ownerFromProposal : Math.max(amount - brokerAmount - partnerAmount, 0)

  const brokerUserId =
    proposal?.broker_buyer_profile_id || proposal?.broker_seller_profile_id || (String(receivable.broker_user_id || '') || null)

  const ownerPersonId =
    proposal?.person_id || property?.owner_client_id || null

  const distributionInsertRes = await admin
    .from('finance_distributions')
    .insert({
      payment_id: params.paymentId,
      business_line_id: lineId,
      status: 'created',
      snapshot: {
        business_line_code: lineCode,
        receivable_id: receivableId,
        proposal_id: proposal?.id ?? null,
        amount,
        broker_amount: brokerAmount,
        partner_amount: partnerAmount,
        owner_amount: ownerAmount,
        created_at: new Date().toISOString(),
      },
      created_by: params.actorUserId,
    })
    .select('id')
    .maybeSingle()

  if (distributionInsertRes.error || !distributionInsertRes.data?.id) {
    if (isUniqueViolation(distributionInsertRes.error)) {
      const existing = await admin
        .from('finance_distributions')
        .select('id')
        .eq('payment_id', params.paymentId)
        .maybeSingle()
      if (existing.data?.id) {
        return { ok: true, distributionId: existing.data.id, createdPayables: 0, alreadyGenerated: true }
      }
    }
    return { ok: false, error: toMessage(distributionInsertRes.error, 'Erro ao iniciar distribuição.') }
  }

  const distributionId = String(distributionInsertRes.data.id)
  const categories = await loadCategoryMap(admin)
  const dueDate = todayIsoDate()
  const payablesToInsert: Array<Record<string, unknown>> = []

  if (lineCode === 'rent') {
    const ownerValue = ownerAmount > 0 ? ownerAmount : amount
    if (ownerValue > 0) {
      payablesToInsert.push({
        title: `Repasse proprietário - ${property?.title || receivable.title || 'Aluguel'}`,
        amount_total: ownerValue,
        amount_open: ownerValue,
        due_date: dueDate,
        status: 'open',
        business_line_id: lineId,
        property_id: propertyId,
        property_category_id: String(receivable.property_category_id || property?.property_category_id || '') || null,
        broker_user_id: brokerUserId,
        financial_category_id: categories.ownerPayoutOutId,
        beneficiary_person_id: ownerPersonId,
        origin_type: 'distribution',
        origin_id: distributionId,
        created_by: params.actorUserId,
      })
    }
    if (brokerAmount > 0 && brokerUserId) {
      payablesToInsert.push({
        title: `Repasse corretor - ${property?.title || receivable.title || 'Aluguel'}`,
        amount_total: brokerAmount,
        amount_open: brokerAmount,
        due_date: dueDate,
        status: 'open',
        business_line_id: lineId,
        property_id: propertyId,
        property_category_id: String(receivable.property_category_id || property?.property_category_id || '') || null,
        broker_user_id: brokerUserId,
        financial_category_id: categories.brokerPayoutOutId,
        origin_type: 'distribution',
        origin_id: distributionId,
        created_by: params.actorUserId,
      })
    }
  } else {
    const brokerValue = brokerAmount > 0 ? brokerAmount : brokerUserId ? amount : 0
    if (brokerValue > 0 && brokerUserId) {
      payablesToInsert.push({
        title: `Comissão corretor - ${property?.title || receivable.title || 'Venda'}`,
        amount_total: brokerValue,
        amount_open: brokerValue,
        due_date: dueDate,
        status: 'open',
        business_line_id: lineId,
        property_id: propertyId,
        property_category_id: String(receivable.property_category_id || property?.property_category_id || '') || null,
        broker_user_id: brokerUserId,
        financial_category_id: categories.brokerPayoutOutId,
        origin_type: 'distribution',
        origin_id: distributionId,
        created_by: params.actorUserId,
      })
    }
    if (partnerAmount > 0) {
      payablesToInsert.push({
        title: `Repasse parceiro - ${property?.title || receivable.title || 'Venda'}`,
        amount_total: partnerAmount,
        amount_open: partnerAmount,
        due_date: dueDate,
        status: 'open',
        business_line_id: lineId,
        property_id: propertyId,
        property_category_id: String(receivable.property_category_id || property?.property_category_id || '') || null,
        financial_category_id: categories.brokerPayoutOutId,
        origin_type: 'distribution',
        origin_id: distributionId,
        created_by: params.actorUserId,
      })
    }
  }

  if (payablesToInsert.length === 0) {
    await admin
      .from('finance_distributions')
      .update({
        status: 'failed',
        snapshot: {
          reason: 'no_payables_generated',
          amount,
          line_code: lineCode,
          proposal_id: proposal?.id ?? null,
        },
      })
      .eq('id', distributionId)
    return { ok: false, error: 'Nenhum repasse gerado para este pagamento.' }
  }

  const payablesInsertRes = await admin
    .from('payables')
    .insert(payablesToInsert)
    .select('id, amount_total, beneficiary_person_id')

  if (payablesInsertRes.error) {
    await admin
      .from('finance_distributions')
      .update({
        status: 'failed',
        snapshot: {
          reason: payablesInsertRes.error.message || 'Erro ao inserir payables.',
        },
      })
      .eq('id', distributionId)
    return { ok: false, error: payablesInsertRes.error.message || 'Erro ao criar repasses (AP).' }
  }

  const insertedPayables = (payablesInsertRes.data ?? []) as Array<{
    id: string
    amount_total: number | null
    beneficiary_person_id: string | null
  }>

  if (lineCode === 'rent') {
    const ownerPayables = insertedPayables.filter((row) => row.beneficiary_person_id)
    if (ownerPayables.length > 0) {
      await admin.from('owner_settlements').insert(
        ownerPayables.map((row) => ({
          payment_id: params.paymentId,
          property_id: propertyId,
          owner_person_id: row.beneficiary_person_id,
          amount: Math.max(toNumber(row.amount_total), 0),
          status: 'pending',
          due_date: dueDate,
          origin_type: 'distribution',
          origin_id: distributionId,
          created_by: params.actorUserId,
        }))
      )
    }
  }

  if (brokerUserId && brokerAmount > 0) {
    await admin.from('commission_events').insert({
      broker_user_id: brokerUserId,
      proposal_id: proposal?.id ?? null,
      payment_id: params.paymentId,
      business_line_id: lineId,
      property_id: propertyId,
      source_type: 'distribution',
      source_id: distributionId,
      amount_total: brokerAmount,
      broker_amount: brokerAmount,
      company_amount: Math.max(toNumber(proposal?.company_commission_value), 0),
      partner_amount: Math.max(toNumber(proposal?.partner_commission_value), 0),
      status: 'generated',
      metadata: {
        receivable_id: receivableId,
      },
    })
  }

  const snapshot = {
    business_line_code: lineCode,
    payment_id: params.paymentId,
    receivable_id: receivableId,
    proposal_id: proposal?.id ?? null,
    created_payables: insertedPayables.map((row) => row.id),
    broker_amount: brokerAmount,
    partner_amount: partnerAmount,
    owner_amount: ownerAmount,
    created_at: new Date().toISOString(),
  }

  await admin
    .from('finance_distributions')
    .update({ status: 'applied', snapshot })
    .eq('id', distributionId)

  await admin
    .from('payments')
    .update({ distribution_status: 'generated' })
    .eq('id', params.paymentId)

  return {
    ok: true,
    distributionId,
    createdPayables: insertedPayables.length,
  }
}

export async function revertDistributionForPayment(params: {
  paymentId: string
  actorUserId: string | null
}): Promise<DistributionResult> {
  const admin = createAdminClient()

  const distributionRes = await admin
    .from('finance_distributions')
    .select('id, status, snapshot')
    .eq('payment_id', params.paymentId)
    .maybeSingle()

  if (distributionRes.error || !distributionRes.data) {
    return { ok: false, error: toMessage(distributionRes.error, 'Distribuição não encontrada.') }
  }

  const distributionId = String(distributionRes.data.id)
  if (String(distributionRes.data.status || '') === 'reverted') {
    return { ok: true, distributionId, createdPayables: 0, alreadyGenerated: true }
  }

  const nowIso = new Date().toISOString()
  await admin
    .from('payables')
    .update({ status: 'canceled', amount_open: 0, updated_at: nowIso })
    .eq('origin_type', 'distribution')
    .eq('origin_id', distributionId)
    .neq('status', 'paid')

  await admin
    .from('owner_settlements')
    .update({ status: 'canceled', paid_at: null, updated_at: nowIso })
    .eq('origin_type', 'distribution')
    .eq('origin_id', distributionId)
    .neq('status', 'paid')

  await admin
    .from('commission_events')
    .update({ status: 'canceled', updated_at: nowIso })
    .eq('source_type', 'distribution')
    .eq('source_id', distributionId)
    .neq('status', 'paid')

  await admin
    .from('finance_distributions')
    .update({
      status: 'reverted',
      snapshot: {
        previous_snapshot: distributionRes.data.snapshot || null,
        reverted_at: nowIso,
        reverted_by: params.actorUserId,
      },
    })
    .eq('id', distributionId)

  await admin.from('payments').update({ distribution_status: 'reverted' }).eq('id', params.paymentId)

  return {
    ok: true,
    distributionId,
    createdPayables: 0,
  }
}

export async function loadFinanceSettingsAdmin(): Promise<FinanceSettingsRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('finance_settings')
    .select('id, finance_automation_enabled, auto_generate_sale_distributions, auto_generate_rent_distributions, updated_at, updated_by')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as FinanceSettingsRow | null
}

export async function shouldAutoGenerateDistribution(params: {
  paymentId: string
  settings?: FinanceSettingsRow | null
}): Promise<boolean> {
  const admin = createAdminClient()
  const settings = params.settings ?? (await loadFinanceSettingsAdmin())
  if (!settings || !settings.finance_automation_enabled) return false

  const paymentRes = await admin.from('payments').select('business_line_id').eq('id', params.paymentId).maybeSingle()
  if (paymentRes.error || !paymentRes.data?.business_line_id) return false

  const lines = await loadBusinessLines(admin)
  const lineCode = lineCodeById(String(paymentRes.data.business_line_id), lines)
  if (lineCode === 'sale') return settings.auto_generate_sale_distributions
  if (lineCode === 'rent') return settings.auto_generate_rent_distributions
  return false
}
