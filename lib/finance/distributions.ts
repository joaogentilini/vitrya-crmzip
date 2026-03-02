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

type DealFinancialResult =
  | {
      ok: true
      dealId: string
      snapshotId: string
      receivableId: string
      createdSnapshot: boolean
      createdReceivable: boolean
      createdDistributions: number
    }
  | { ok: false; error: string }

type DealReceiptResult =
  | {
      ok: true
      dealId: string
      snapshotStatus: 'waiting_receipt' | 'payable' | 'paid'
      receivableId: string
      receivableStatus: string
      paymentId: string | null
      releasedBrokerDistributions: number
      createdBrokerPayables: number
    }
  | { ok: false; error: string }

type DealCommissionPaidResult =
  | {
      ok: true
      dealId: string
      snapshotStatus: 'waiting_receipt' | 'payable' | 'paid'
      paidBrokerDistributions: number
      paidBrokerPayables: number
    }
  | { ok: false; error: string }

function roundMoney(value: number): number {
  const safe = Number.isFinite(value) ? value : 0
  return Math.round((safe + Number.EPSILON) * 100) / 100
}

function percentOf(base: number, percent: number): number {
  return roundMoney((Math.max(base, 0) * Math.max(percent, 0)) / 100)
}

function toDateIsoNow(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeDealCommissionStatus(value: unknown): 'waiting_receipt' | 'payable' | 'paid' {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'payable') return 'payable'
  if (normalized === 'paid') return 'paid'
  return 'waiting_receipt'
}

async function resolveDefaultFinancialAccountId(params: {
  admin: AdminClient
  businessLineId: string | null
}): Promise<string | null> {
  const { admin, businessLineId } = params

  if (businessLineId) {
    const byLineRes = await admin
      .from('financial_accounts')
      .select('id')
      .eq('is_active', true)
      .eq('business_line_id', businessLineId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!byLineRes.error && byLineRes.data?.id) return String(byLineRes.data.id)
  }

  const fallbackRes = await admin
    .from('financial_accounts')
    .select('id')
    .eq('is_active', true)
    .is('business_line_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!fallbackRes.error && fallbackRes.data?.id) return String(fallbackRes.data.id)

  const anyRes = await admin
    .from('financial_accounts')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!anyRes.error && anyRes.data?.id) return String(anyRes.data.id)
  return null
}

async function ensureDealDistributionRows(params: {
  admin: AdminClient
  dealId: string
  receivableId: string
  businessLineId: string | null
  propertyId: string
  brokerUserId: string | null
  actorUserId: string | null
  amountBroker: number
  amountCompany: number
  amountPartner: number
}): Promise<{ created: number }> {
  const { admin } = params
  const roles: Array<{ role: 'broker' | 'company' | 'partner'; amount: number; brokerUserId: string | null }> = [
    { role: 'broker', amount: roundMoney(params.amountBroker), brokerUserId: params.brokerUserId },
    { role: 'company', amount: roundMoney(params.amountCompany), brokerUserId: null },
    { role: 'partner', amount: roundMoney(params.amountPartner), brokerUserId: null },
  ]

  let created = 0
  const nowIso = new Date().toISOString()
  for (const row of roles) {
    if (row.amount <= 0) continue

    const existingRes = await admin
      .from('finance_distributions')
      .select('id, payout_status')
      .eq('deal_id', params.dealId)
      .eq('role', row.role)
      .order('created_at', { ascending: false })
      .limit(1)

    const existing = ((existingRes.data ?? []) as Array<{ id: string; payout_status: string | null }>)[0] ?? null
    if (existing?.id) {
      const payoutStatus = String(existing.payout_status || '').toLowerCase()
      if (payoutStatus === 'paid') continue
      await admin
        .from('finance_distributions')
        .update({
          receivable_id: params.receivableId,
          business_line_id: params.businessLineId,
          property_id: params.propertyId,
          broker_user_id: row.brokerUserId,
          amount: row.amount,
          status: payoutStatus === 'released' ? 'applied' : 'created',
          updated_at: nowIso,
        })
        .eq('id', existing.id)
      continue
    }

    const insertRes = await admin
      .from('finance_distributions')
      .insert({
        payment_id: null,
        deal_id: params.dealId,
        receivable_id: params.receivableId,
        role: row.role,
        amount: row.amount,
        payout_status: 'pending',
        business_line_id: params.businessLineId,
        property_id: params.propertyId,
        broker_user_id: row.brokerUserId,
        status: 'created',
        snapshot: {
          source: 'deal',
          role: row.role,
          amount: row.amount,
          deal_id: params.dealId,
          receivable_id: params.receivableId,
          created_at: nowIso,
        },
        created_by: params.actorUserId,
      })

    if (insertRes.error && !isUniqueViolation(insertRes.error)) {
      return { created }
    }
    if (!insertRes.error) created += 1
  }

  return { created }
}

export async function ensureDealFinancials(params: {
  dealId: string
  actorUserId: string | null
}): Promise<DealFinancialResult> {
  const admin = createAdminClient()
  const dealId = String(params.dealId || '').trim()
  if (!dealId) return { ok: false, error: 'Deal invalido para sincronizacao financeira.' }

  const dealRes = await admin
    .from('deals')
    .select('id, property_id, owner_user_id, lead_id, negotiation_id, proposal_id, operation_type, status, closed_at, gross_value')
    .eq('id', dealId)
    .maybeSingle()

  if (dealRes.error || !dealRes.data) {
    return { ok: false, error: toMessage(dealRes.error, 'Deal nao encontrado para gerar financeiro.') }
  }

  const deal = dealRes.data as {
    id: string
    property_id: string
    owner_user_id: string | null
    lead_id: string | null
    negotiation_id: string | null
    proposal_id: string | null
    operation_type: string | null
    status: string | null
    closed_at: string | null
    gross_value: number | null
  }

  if (!deal.property_id) {
    return { ok: false, error: 'Deal sem imovel vinculado.' }
  }

  const propertyRes = await admin
    .from('properties')
    .select('id, title, purpose, price, rent_price, owner_user_id, property_category_id, business_line_id')
    .eq('id', deal.property_id)
    .maybeSingle()

  const property = (propertyRes.data ?? null) as
    | {
        id: string
        title: string | null
        purpose: string | null
        price: number | null
        rent_price: number | null
        owner_user_id: string | null
        property_category_id: string | null
        business_line_id: string | null
      }
    | null

  if (!property) {
    return { ok: false, error: 'Imovel do deal nao encontrado para gerar financeiro.' }
  }

  let proposal:
    | (ProposalRow & {
        base_value?: number | null
      })
    | null = null

  if (deal.proposal_id) {
    const proposalRes = await admin
      .from('property_proposals')
      .select(
        'id, title, status, approved_at, property_id, person_id, lead_id, lead_type_id, lead_interest_id, lead_source_id, property_category_id, broker_seller_profile_id, broker_buyer_profile_id, business_line_id, commission_percent, commission_value, broker_commission_value, partner_commission_value, company_commission_value, owner_net_value, source_type, base_value'
      )
      .eq('id', deal.proposal_id)
      .maybeSingle()
    if (!proposalRes.error && proposalRes.data) proposal = proposalRes.data as ProposalRow & { base_value?: number | null }
  }

  const leadRes = deal.lead_id
    ? await admin
        .from('leads')
        .select('id, lead_type_id, lead_interest_id, lead_source_id')
        .eq('id', deal.lead_id)
        .maybeSingle()
    : { data: null, error: null as { message?: string } | null }

  const leadDims = (leadRes.data ?? null) as
    | {
        id: string
        lead_type_id: string | null
        lead_interest_id: string | null
        lead_source_id: string | null
      }
    | null

  const settingRes = await admin
    .from('property_commission_settings')
    .select(
      'sale_commission_percent, sale_broker_split_percent, sale_partner_split_percent, rent_initial_commission_percent, rent_broker_split_percent, rent_partner_split_percent'
    )
    .eq('property_id', deal.property_id)
    .maybeSingle()

  const settings = (settingRes.data ?? null) as
    | {
        sale_commission_percent: number | null
        sale_broker_split_percent: number | null
        sale_partner_split_percent: number | null
        rent_initial_commission_percent: number | null
        rent_broker_split_percent: number | null
        rent_partner_split_percent: number | null
      }
    | null

  const lines = await loadBusinessLines(admin)
  const inferredBusinessLineId =
    proposal?.business_line_id ??
    property.business_line_id ??
    (deal.operation_type === 'rent' ? lines.rentId : lines.saleId) ??
    lines.saleId
  const businessLineCode = lineCodeById(inferredBusinessLineId, lines)

  const brokerUserId =
    proposal?.broker_buyer_profile_id ??
    proposal?.broker_seller_profile_id ??
    property.owner_user_id ??
    deal.owner_user_id ??
    null

  const brokerProfileRes = brokerUserId
    ? await admin
        .from('profiles')
        .select('id, broker_commission_percent, company_commission_percent, partner_commission_percent')
        .eq('id', brokerUserId)
        .maybeSingle()
    : { data: null, error: null as { message?: string } | null }

  const brokerProfile = (brokerProfileRes.data ?? null) as
    | {
        id: string
        broker_commission_percent: number | null
        company_commission_percent: number | null
        partner_commission_percent: number | null
      }
    | null

  let grossValue = roundMoney(toNumber(deal.gross_value))
  if (grossValue <= 0) grossValue = roundMoney(toNumber(proposal?.base_value))
  if (grossValue <= 0) {
    grossValue = businessLineCode === 'rent' ? roundMoney(toNumber(property.rent_price)) : roundMoney(toNumber(property.price))
  }

  const commissionPercentFromSettings =
    businessLineCode === 'rent'
      ? toNumber(settings?.rent_initial_commission_percent)
      : toNumber(settings?.sale_commission_percent)

  const commissionPercent = roundMoney(
    toNumber(proposal?.commission_percent) > 0 ? toNumber(proposal?.commission_percent) : commissionPercentFromSettings > 0 ? commissionPercentFromSettings : 5
  )

  let totalCommissionValue = roundMoney(toNumber(proposal?.commission_value))
  if (totalCommissionValue <= 0) totalCommissionValue = percentOf(grossValue, commissionPercent)

  const splitBrokerFromSettings =
    businessLineCode === 'rent' ? toNumber(settings?.rent_broker_split_percent) : toNumber(settings?.sale_broker_split_percent)
  const splitPartnerFromSettings =
    businessLineCode === 'rent' ? toNumber(settings?.rent_partner_split_percent) : toNumber(settings?.sale_partner_split_percent)

  const brokerSplitPercent =
    splitBrokerFromSettings > 0
      ? splitBrokerFromSettings
      : toNumber(brokerProfile?.broker_commission_percent) > 0
      ? toNumber(brokerProfile?.broker_commission_percent)
      : 50

  const partnerSplitPercent =
    splitPartnerFromSettings > 0
      ? splitPartnerFromSettings
      : toNumber(brokerProfile?.partner_commission_percent) > 0
      ? toNumber(brokerProfile?.partner_commission_percent)
      : 0

  let brokerCommissionValue = roundMoney(toNumber(proposal?.broker_commission_value))
  let partnerCommissionValue = roundMoney(toNumber(proposal?.partner_commission_value))
  let companyCommissionValue = roundMoney(toNumber(proposal?.company_commission_value))

  if (brokerCommissionValue <= 0 && partnerCommissionValue <= 0 && companyCommissionValue <= 0) {
    brokerCommissionValue = percentOf(totalCommissionValue, brokerSplitPercent)
    partnerCommissionValue = percentOf(totalCommissionValue, partnerSplitPercent)
    companyCommissionValue = roundMoney(totalCommissionValue - brokerCommissionValue - partnerCommissionValue)
  } else if (companyCommissionValue <= 0) {
    companyCommissionValue = roundMoney(totalCommissionValue - brokerCommissionValue - partnerCommissionValue)
  }

  brokerCommissionValue = Math.max(roundMoney(brokerCommissionValue), 0)
  partnerCommissionValue = Math.max(roundMoney(partnerCommissionValue), 0)
  companyCommissionValue = Math.max(roundMoney(companyCommissionValue), 0)
  totalCommissionValue = Math.max(roundMoney(totalCommissionValue), 0)

  const existingSnapshotRes = await admin
    .from('deal_commission_snapshots')
    .select(
      'id, status, gross_value, total_commission_value, broker_commission_value, company_commission_value, partner_commission_value'
    )
    .eq('deal_id', deal.id)
    .maybeSingle()

  let snapshotId = String(existingSnapshotRes.data?.id || '')
  let createdSnapshot = false
  const snapshotStatus = normalizeDealCommissionStatus(existingSnapshotRes.data?.status)
  if (!snapshotId) {
    const insertSnapshotRes = await admin
      .from('deal_commission_snapshots')
      .insert({
        deal_id: deal.id,
        property_id: property.id,
        negotiation_id: deal.negotiation_id,
        broker_user_id: brokerUserId,
        gross_value: grossValue,
        total_commission_value: totalCommissionValue,
        broker_commission_value: brokerCommissionValue,
        company_commission_value: companyCommissionValue,
        partner_commission_value: partnerCommissionValue,
        status: 'waiting_receipt',
        calc_json: {
          source: proposal?.id ? 'proposal_snapshot' : 'property_commission_settings',
          proposal_id: proposal?.id ?? null,
          business_line_code: businessLineCode,
          commission_percent: commissionPercent,
          split_broker_percent: brokerSplitPercent,
          split_partner_percent: partnerSplitPercent,
          gross_value: grossValue,
          total_commission_value: totalCommissionValue,
          broker_commission_value: brokerCommissionValue,
          company_commission_value: companyCommissionValue,
          partner_commission_value: partnerCommissionValue,
        },
      })
      .select('id')
      .maybeSingle()

    if (insertSnapshotRes.error || !insertSnapshotRes.data?.id) {
      return { ok: false, error: toMessage(insertSnapshotRes.error, 'Erro ao criar snapshot de comissao do deal.') }
    }
    snapshotId = String(insertSnapshotRes.data.id)
    createdSnapshot = true
  } else if (snapshotStatus === 'waiting_receipt') {
    await admin
      .from('deal_commission_snapshots')
      .update({
        property_id: property.id,
        negotiation_id: deal.negotiation_id,
        broker_user_id: brokerUserId,
        gross_value: grossValue,
        total_commission_value: totalCommissionValue,
        broker_commission_value: brokerCommissionValue,
        company_commission_value: companyCommissionValue,
        partner_commission_value: partnerCommissionValue,
        calc_json: {
          source: proposal?.id ? 'proposal_snapshot' : 'property_commission_settings',
          proposal_id: proposal?.id ?? null,
          business_line_code: businessLineCode,
          commission_percent: commissionPercent,
          split_broker_percent: brokerSplitPercent,
          split_partner_percent: partnerSplitPercent,
          gross_value: grossValue,
          total_commission_value: totalCommissionValue,
          broker_commission_value: brokerCommissionValue,
          company_commission_value: companyCommissionValue,
          partner_commission_value: partnerCommissionValue,
        },
      })
      .eq('id', snapshotId)
  } else {
    grossValue = roundMoney(toNumber(existingSnapshotRes.data?.gross_value))
    totalCommissionValue = roundMoney(toNumber(existingSnapshotRes.data?.total_commission_value))
    brokerCommissionValue = roundMoney(toNumber(existingSnapshotRes.data?.broker_commission_value))
    companyCommissionValue = roundMoney(toNumber(existingSnapshotRes.data?.company_commission_value))
    partnerCommissionValue = roundMoney(toNumber(existingSnapshotRes.data?.partner_commission_value))
  }

  let proposalPaymentMethodId: string | null = null
  if (deal.proposal_id) {
    const firstPaymentRes = await admin
      .from('property_proposal_payments')
      .select('proposal_payment_method_id')
      .eq('proposal_id', deal.proposal_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!firstPaymentRes.error && firstPaymentRes.data?.proposal_payment_method_id) {
      proposalPaymentMethodId = String(firstPaymentRes.data.proposal_payment_method_id)
    }
  }

  const categories = await loadCategoryMap(admin)
  const receivableCategoryId = businessLineCode === 'rent' ? categories.rentRevenueInId : categories.saleRevenueInId
  const dueDate = toDateIsoNow()

  const existingReceivableRes = await admin
    .from('receivables')
    .select('id, status')
    .eq('origin_type', 'deal')
    .eq('origin_id', deal.id)
    .maybeSingle()

  const receivablePayload: Record<string, unknown> = {
    title: `Comissao do deal - ${property.title || deal.id.slice(0, 8)}`,
    amount_total: totalCommissionValue,
    amount_open: totalCommissionValue,
    due_date: dueDate,
    status: 'open',
    business_line_id: inferredBusinessLineId,
    property_id: property.id,
    property_category_id: proposal?.property_category_id ?? property.property_category_id ?? null,
    lead_id: proposal?.lead_id ?? deal.lead_id ?? null,
    lead_type_id: proposal?.lead_type_id ?? leadDims?.lead_type_id ?? null,
    lead_interest_id: proposal?.lead_interest_id ?? leadDims?.lead_interest_id ?? null,
    lead_source_id: proposal?.lead_source_id ?? leadDims?.lead_source_id ?? null,
    broker_user_id: brokerUserId,
    financial_category_id: receivableCategoryId,
    proposal_payment_method_id: proposalPaymentMethodId,
    origin_type: 'deal',
    origin_id: deal.id,
    created_by: params.actorUserId,
    metadata: {
      source: 'deal_commission_snapshot',
      snapshot_id: snapshotId,
      commission_percent: commissionPercent,
      gross_value: grossValue,
      proposal_id: proposal?.id ?? null,
      negotiation_id: deal.negotiation_id ?? null,
    },
    updated_at: new Date().toISOString(),
  }

  let receivableId = String(existingReceivableRes.data?.id || '')
  let createdReceivable = false
  if (!receivableId) {
    const insertReceivableRes = await admin.from('receivables').insert(receivablePayload).select('id').maybeSingle()
    if (insertReceivableRes.error || !insertReceivableRes.data?.id) {
      if (!isUniqueViolation(insertReceivableRes.error)) {
        return { ok: false, error: toMessage(insertReceivableRes.error, 'Erro ao criar conta a receber do deal.') }
      }
      const conflictRes = await admin
        .from('receivables')
        .select('id')
        .eq('origin_type', 'deal')
        .eq('origin_id', deal.id)
        .maybeSingle()
      if (!conflictRes.data?.id) {
        return { ok: false, error: 'Conta a receber do deal ja existe, mas nao foi possivel localiza-la.' }
      }
      receivableId = String(conflictRes.data.id)
    } else {
      receivableId = String(insertReceivableRes.data.id)
      createdReceivable = true
    }
  } else {
    const currentStatus = String(existingReceivableRes.data?.status || '').toLowerCase()
    if (currentStatus !== 'paid' && currentStatus !== 'canceled') {
      await admin.from('receivables').update(receivablePayload).eq('id', receivableId)
    }
  }

  if (!receivableId) {
    return { ok: false, error: 'Falha ao resolver conta a receber do deal.' }
  }

  const distributionSync = await ensureDealDistributionRows({
    admin,
    dealId: deal.id,
    receivableId,
    businessLineId: inferredBusinessLineId,
    propertyId: property.id,
    brokerUserId,
    actorUserId: params.actorUserId,
    amountBroker: brokerCommissionValue,
    amountCompany: companyCommissionValue,
    amountPartner: partnerCommissionValue,
  })

  return {
    ok: true,
    dealId: deal.id,
    snapshotId,
    receivableId,
    createdSnapshot,
    createdReceivable,
    createdDistributions: distributionSync.created,
  }
}

export async function confirmDealReceipt(params: {
  dealId: string
  actorUserId: string | null
}): Promise<DealReceiptResult> {
  const ensured = await ensureDealFinancials(params)
  if (!ensured.ok) return ensured

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const today = toDateIsoNow()

  const snapshotRes = await admin
    .from('deal_commission_snapshots')
    .select('id, deal_id, broker_user_id, status, broker_commission_value')
    .eq('deal_id', params.dealId)
    .maybeSingle()
  if (snapshotRes.error || !snapshotRes.data) {
    return { ok: false, error: toMessage(snapshotRes.error, 'Snapshot do deal nao encontrado para confirmar recebimento.') }
  }

  const snapshot = snapshotRes.data as {
    id: string
    deal_id: string
    broker_user_id: string | null
    status: string | null
    broker_commission_value: number | null
  }

  const dealRes = await admin
    .from('deals')
    .select('id, proposal_id, property_id')
    .eq('id', params.dealId)
    .maybeSingle()
  const deal = (dealRes.data ?? null) as { id: string; proposal_id: string | null; property_id: string | null } | null

  const receivableRes = await admin
    .from('receivables')
    .select('id, status, amount_total, business_line_id, property_id, property_category_id, broker_user_id, proposal_payment_method_id')
    .eq('origin_type', 'deal')
    .eq('origin_id', params.dealId)
    .maybeSingle()
  if (receivableRes.error || !receivableRes.data?.id) {
    return { ok: false, error: toMessage(receivableRes.error, 'Receivable do deal nao encontrado para confirmar recebimento.') }
  }

  const receivable = receivableRes.data as {
    id: string
    status: string | null
    amount_total: number | null
    business_line_id: string | null
    property_id: string | null
    property_category_id: string | null
    broker_user_id: string | null
    proposal_payment_method_id: string | null
  }

  const currentReceivableStatus = String(receivable.status || '').toLowerCase()
  if (currentReceivableStatus !== 'paid') {
    await admin
      .from('receivables')
      .update({
        status: 'paid',
        amount_open: 0,
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', receivable.id)
  }

  let paymentId: string | null = null
  const paymentRes = await admin
    .from('payments')
    .select('id')
    .eq('direction', 'in')
    .eq('receivable_id', receivable.id)
    .eq('origin_type', 'deal_receipt')
    .eq('origin_id', params.dealId)
    .maybeSingle()

  if (paymentRes.data?.id) {
    paymentId = String(paymentRes.data.id)
    await admin
      .from('payments')
      .update({
        status: 'confirmed',
        amount: roundMoney(toNumber(receivable.amount_total)),
        paid_at: nowIso,
        business_line_id: receivable.business_line_id,
        property_id: receivable.property_id,
        property_category_id: receivable.property_category_id,
        broker_user_id: receivable.broker_user_id,
        proposal_payment_method_id: receivable.proposal_payment_method_id ?? null,
        collection_method_id: null,
        distribution_status: 'pending',
        updated_at: nowIso,
      })
      .eq('id', paymentId)
  } else {
    const financialAccountId = await resolveDefaultFinancialAccountId({
      admin,
      businessLineId: receivable.business_line_id,
    })

    if (financialAccountId) {
      const insertPaymentRes = await admin
        .from('payments')
        .insert({
          direction: 'in',
          receivable_id: receivable.id,
          payable_id: null,
          financial_account_id: financialAccountId,
          payment_method_id: null,
          proposal_payment_method_id: receivable.proposal_payment_method_id ?? null,
          collection_method_id: null,
          amount: roundMoney(toNumber(receivable.amount_total)),
          paid_at: nowIso,
          status: 'confirmed',
          external_provider: null,
          external_id: null,
          origin_type: 'deal_receipt',
          origin_id: params.dealId,
          business_line_id: receivable.business_line_id,
          property_id: receivable.property_id,
          property_category_id: receivable.property_category_id,
          broker_user_id: receivable.broker_user_id,
          distribution_status: 'pending',
          created_by: params.actorUserId,
        })
        .select('id')
        .maybeSingle()

      if (!insertPaymentRes.error && insertPaymentRes.data?.id) {
        paymentId = String(insertPaymentRes.data.id)
      }
    }
  }

  await admin
    .from('deal_commission_snapshots')
    .update({
      status: normalizeDealCommissionStatus(snapshot.status) === 'paid' ? 'paid' : 'payable',
      updated_at: nowIso,
    })
    .eq('id', snapshot.id)

  const brokerDistributionRes = await admin
    .from('finance_distributions')
    .select('id, amount, payout_status, broker_user_id')
    .eq('deal_id', params.dealId)
    .eq('role', 'broker')

  const brokerDistributions = (brokerDistributionRes.data ?? []) as Array<{
    id: string
    amount: number | null
    payout_status: string | null
    broker_user_id: string | null
  }>

  let releasedBrokerDistributions = 0
  const releasedDistributionIds: string[] = []
  for (const distribution of brokerDistributions) {
    const payoutStatus = String(distribution.payout_status || '').toLowerCase()
    if (payoutStatus === 'paid') continue
    if (payoutStatus !== 'released') releasedBrokerDistributions += 1
    releasedDistributionIds.push(distribution.id)
  }

  if (releasedDistributionIds.length > 0) {
    await admin
      .from('finance_distributions')
      .update({
        payout_status: 'released',
        released_at: nowIso,
        status: 'applied',
        updated_at: nowIso,
      })
      .in('id', releasedDistributionIds)
  }

  const categories = await loadCategoryMap(admin)
  let createdBrokerPayables = 0

  for (const distribution of brokerDistributions) {
    const amount = roundMoney(toNumber(distribution.amount))
    if (amount <= 0) continue

    const existingPayableRes = await admin
      .from('payables')
      .select('id')
      .eq('origin_type', 'deal_commission_distribution')
      .eq('origin_id', distribution.id)
      .maybeSingle()
    if (existingPayableRes.data?.id) continue

    const insertPayableRes = await admin.from('payables').insert({
      title: `Comissao corretor - Deal ${params.dealId.slice(0, 8)}`,
      amount_total: amount,
      amount_open: amount,
      due_date: today,
      status: 'open',
      business_line_id: receivable.business_line_id,
      property_id: receivable.property_id ?? deal?.property_id ?? null,
      property_category_id: receivable.property_category_id ?? null,
      broker_user_id: distribution.broker_user_id ?? snapshot.broker_user_id ?? null,
      financial_category_id: categories.brokerPayoutOutId,
      origin_type: 'deal_commission_distribution',
      origin_id: distribution.id,
      created_by: params.actorUserId,
      metadata: {
        deal_id: params.dealId,
        snapshot_id: snapshot.id,
      },
    })

    if (!insertPayableRes.error) createdBrokerPayables += 1
  }

  if (deal?.proposal_id && snapshot.broker_user_id) {
    const brokerPaymentLookup = await admin
      .from('broker_commission_payments')
      .select('id')
      .eq('proposal_id', deal.proposal_id)
      .eq('broker_profile_id', snapshot.broker_user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!brokerPaymentLookup.error && !brokerPaymentLookup.data?.id) {
      await admin.from('broker_commission_payments').insert({
        proposal_id: deal.proposal_id,
        broker_profile_id: snapshot.broker_user_id,
        amount: roundMoney(toNumber(snapshot.broker_commission_value)),
        status: 'pending',
        expected_at: today,
        notes: `Gerado automaticamente a partir do deal ${params.dealId}.`,
        created_by_profile_id: params.actorUserId,
        source_type: 'property',
        source_id: deal.property_id ?? null,
        commission_snapshot: {
          deal_id: params.dealId,
          snapshot_id: snapshot.id,
        },
      })
    }
  }

  return {
    ok: true,
    dealId: params.dealId,
    snapshotStatus: 'payable',
    receivableId: receivable.id,
    receivableStatus: 'paid',
    paymentId,
    releasedBrokerDistributions,
    createdBrokerPayables,
  }
}

export async function markDealBrokerCommissionPaid(params: {
  dealId: string
  actorUserId: string | null
}): Promise<DealCommissionPaidResult> {
  const ensured = await ensureDealFinancials(params)
  if (!ensured.ok) return ensured

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const today = toDateIsoNow()

  const snapshotRes = await admin
    .from('deal_commission_snapshots')
    .select('id, status, broker_user_id')
    .eq('deal_id', params.dealId)
    .maybeSingle()
  if (snapshotRes.error || !snapshotRes.data) {
    return { ok: false, error: toMessage(snapshotRes.error, 'Snapshot do deal nao encontrado para pagamento.') }
  }

  const snapshot = snapshotRes.data as { id: string; status: string | null; broker_user_id: string | null }

  const dealRes = await admin
    .from('deals')
    .select('id, proposal_id')
    .eq('id', params.dealId)
    .maybeSingle()
  const deal = (dealRes.data ?? null) as { id: string; proposal_id: string | null } | null

  const brokerDistributionsRes = await admin
    .from('finance_distributions')
    .select('id, payout_status')
    .eq('deal_id', params.dealId)
    .eq('role', 'broker')

  const brokerDistributions = (brokerDistributionsRes.data ?? []) as Array<{ id: string; payout_status: string | null }>
  const payDistributionIds = brokerDistributions
    .filter((row) => String(row.payout_status || '').toLowerCase() !== 'paid')
    .map((row) => row.id)

  if (payDistributionIds.length > 0) {
    await admin
      .from('finance_distributions')
      .update({
        payout_status: 'paid',
        paid_at: nowIso,
        status: 'applied',
        updated_at: nowIso,
      })
      .in('id', payDistributionIds)
  }

  const payablesRes = await admin
    .from('payables')
    .select('id, status')
    .eq('origin_type', 'deal_commission_distribution')
    .in('origin_id', payDistributionIds.length > 0 ? payDistributionIds : ['00000000-0000-0000-0000-000000000000'])

  const payables = (payablesRes.data ?? []) as Array<{ id: string; status: string | null }>
  const payableIdsToPay = payables.filter((row) => String(row.status || '').toLowerCase() !== 'paid').map((row) => row.id)

  if (payableIdsToPay.length > 0) {
    await admin
      .from('payables')
      .update({
        status: 'paid',
        amount_open: 0,
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .in('id', payableIdsToPay)
  }

  if (deal?.proposal_id && snapshot.broker_user_id) {
    await admin
      .from('broker_commission_payments')
      .update({
        status: 'received',
        received_at: today,
        updated_at: nowIso,
      })
      .eq('proposal_id', deal.proposal_id)
      .eq('broker_profile_id', snapshot.broker_user_id)
      .neq('status', 'received')
  }

  await admin
    .from('deal_commission_snapshots')
    .update({
      status: 'paid',
      updated_at: nowIso,
    })
    .eq('id', snapshot.id)

  return {
    ok: true,
    dealId: params.dealId,
    snapshotStatus: 'paid',
    paidBrokerDistributions: payDistributionIds.length,
    paidBrokerPayables: payableIdsToPay.length,
  }
}
