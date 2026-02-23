import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getManagerContext } from '@/lib/finance/auth'
import { isMissingRelationError } from '@/lib/finance/errors'
import {
  cancelAsaasCharge,
  createAsaasCharge,
  createAsaasCustomer,
  fetchAsaasPixQrCode,
  updateAsaasChargeDueDate,
} from '@/lib/integrations/asaas'

export const runtime = 'nodejs'

type ChargePostBody = {
  receivable_id?: string
  method?: 'boleto' | 'pix' | 'boleto_pix'
  customer?: {
    name?: string
    email?: string
    phone?: string
    cpf_cnpj?: string
  }
}

type ChargePatchBody = {
  action?: 'change_due_date' | 'cancel'
  asaas_charge_id?: string
  receivable_id?: string
  due_date?: string
}

type ReceivableChargeContext = {
  id: string
  title: string
  amount_total: number
  amount_open: number
  due_date: string
  status: string
  business_line_id: string | null
  property_id: string | null
  broker_user_id: string | null
  origin_type: string
  origin_id: string | null
}

function normalizeDigits(value: string | null | undefined): string | null {
  const digits = String(value || '').replace(/\D/g, '')
  return digits || null
}

function normalizePhoneForAsaas(value: string | null | undefined): string | null {
  const digits = normalizeDigits(value)
  if (!digits) return null
  if (digits.startsWith('55') && digits.length > 11) return digits.slice(2)
  return digits
}

function parseDueDate(value: unknown): string | null {
  const text = String(value || '').trim()
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  return text
}

function collectionMethodCodeFromCharge(params: {
  billingType: string | null
  pixPayload: string | null
  bankSlipUrl: string | null
  bankSlipPdf: string | null
  requestedMethod: string
}): 'boleto' | 'pix' | null {
  const billingType = String(params.billingType || '').trim().toUpperCase()
  if (billingType === 'PIX') return 'pix'
  if (billingType === 'BOLETO') return 'boleto'

  const requestedMethod = String(params.requestedMethod || '').trim().toLowerCase()
  if (requestedMethod === 'pix') return 'pix'
  if (requestedMethod === 'boleto') return 'boleto'

  if (String(params.pixPayload || '').trim() && !String(params.bankSlipUrl || '').trim() && !String(params.bankSlipPdf || '').trim()) {
    return 'pix'
  }
  if (String(params.bankSlipUrl || '').trim() || String(params.bankSlipPdf || '').trim()) {
    return 'boleto'
  }
  return null
}

async function resolvePersonFromReceivable(params: {
  admin: ReturnType<typeof createAdminClient>
  receivable: ReceivableChargeContext
}) {
  const { admin, receivable } = params

  if (!receivable.origin_id) return null

  let personId: string | null = null
  if (receivable.origin_type === 'property_proposal') {
    const proposalRes = await admin.from('property_proposals').select('person_id').eq('id', receivable.origin_id).maybeSingle()
    personId = String(proposalRes.data?.person_id || '') || null
  } else if (receivable.origin_type === 'property_proposal_payment') {
    const paymentRes = await admin
      .from('property_proposal_payments')
      .select('proposal_id')
      .eq('id', receivable.origin_id)
      .maybeSingle()
    const proposalId = String(paymentRes.data?.proposal_id || '') || null
    if (proposalId) {
      const proposalRes = await admin.from('property_proposals').select('person_id').eq('id', proposalId).maybeSingle()
      personId = String(proposalRes.data?.person_id || '') || null
    }
  }

  if (!personId) return null

  const personRes = await admin
    .from('people')
    .select('id, full_name, email, phone_e164, document_id')
    .eq('id', personId)
    .maybeSingle()

  if (personRes.error || !personRes.data) return null
  return personRes.data as {
    id: string
    full_name: string | null
    email: string | null
    phone_e164: string | null
    document_id: string | null
  }
}

async function resolveAsaasAccountForReceivable(params: {
  admin: ReturnType<typeof createAdminClient>
  receivable: ReceivableChargeContext
}) {
  const { admin, receivable } = params

  let primaryQuery = admin
    .from('financial_accounts')
    .select('id, name, asaas_wallet_id, business_line_id')
    .eq('is_active', true)
    .not('asaas_wallet_id', 'is', null)
    .order('created_at', { ascending: true })

  if (receivable.business_line_id) {
    primaryQuery = primaryQuery.eq('business_line_id', receivable.business_line_id)
  }

  let accountRes = await primaryQuery.limit(1).maybeSingle()
  if (!accountRes.data && !accountRes.error) {
    accountRes = await admin
      .from('financial_accounts')
      .select('id, name, asaas_wallet_id, business_line_id')
      .eq('is_active', true)
      .is('business_line_id', null)
      .not('asaas_wallet_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  }

  return accountRes
}

async function resolveAsaasCustomerId(params: {
  admin: ReturnType<typeof createAdminClient>
  person:
    | {
        id: string
        full_name: string | null
        email: string | null
        phone_e164: string | null
        document_id: string | null
      }
    | null
  customerOverride: ChargePostBody['customer']
}) {
  const { admin, person, customerOverride } = params

  if (person?.id) {
    const linked = await admin
      .from('asaas_customers')
      .select('id, asaas_customer_id')
      .eq('person_id', person.id)
      .maybeSingle()
    if (!linked.error && linked.data?.asaas_customer_id) {
      return { ok: true as const, asaasCustomerId: String(linked.data.asaas_customer_id), personId: person.id }
    }
  }

  const name = String(person?.full_name || customerOverride?.name || '').trim()
  const email = String(person?.email || customerOverride?.email || '').trim() || null
  const phone = normalizePhoneForAsaas(person?.phone_e164 || customerOverride?.phone || null)
  const cpfCnpj = normalizeDigits(person?.document_id || customerOverride?.cpf_cnpj || null)

  if (!name) {
    return {
      ok: false as const,
      error:
        'Não foi possível identificar o cliente da cobrança. Informe customer.name no payload ou vincule pessoa à proposta.',
    }
  }

  const createCustomerRes = await createAsaasCustomer({
    name,
    email,
    phone,
    cpfCnpj,
  })

  if (!createCustomerRes.ok) {
    return {
      ok: false as const,
      error: createCustomerRes.error || 'Erro ao criar cliente no Asaas.',
    }
  }

  const asaasCustomerId = String(createCustomerRes.data?.id || '').trim()
  if (!asaasCustomerId) {
    return { ok: false as const, error: 'Asaas não retornou customer_id na criação do cliente.' }
  }

  await admin.from('asaas_customers').insert({
    person_id: person?.id ?? null,
    asaas_customer_id: asaasCustomerId,
    payload: createCustomerRes.data || {},
  })

  return { ok: true as const, asaasCustomerId, personId: person?.id ?? null }
}

export async function POST(request: Request) {
  const auth = await getManagerContext()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => null)) as ChargePostBody | null
  const receivableId = String(body?.receivable_id || '').trim()
  const method = String(body?.method || 'boleto_pix').trim()
  const normalizedMethod = method.toLowerCase()

  if (!receivableId) {
    return NextResponse.json({ ok: false, error: 'receivable_id é obrigatório.' }, { status: 400 })
  }
  if (!['boleto', 'pix', 'boleto_pix'].includes(normalizedMethod)) {
    return NextResponse.json({ ok: false, error: 'method inválido. Use boleto, pix ou boleto_pix.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const receivableRes = await admin
    .from('receivables')
    .select(
      'id, title, amount_total, amount_open, due_date, status, business_line_id, property_id, broker_user_id, origin_type, origin_id'
    )
    .eq('id', receivableId)
    .maybeSingle()

  if (receivableRes.error || !receivableRes.data) {
    if (isMissingRelationError(receivableRes.error)) {
      return NextResponse.json(
        { ok: false, error: 'Schema financeiro não encontrado. Aplique a migration 202602221530_finance_erp_asaas_mvp.sql.' },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { ok: false, error: receivableRes.error?.message || 'Conta a receber não encontrada.' },
      { status: 404 }
    )
  }

  const receivable = receivableRes.data as ReceivableChargeContext
  if (receivable.status === 'paid') {
    return NextResponse.json({ ok: false, error: 'Receivable já está pago.' }, { status: 409 })
  }
  if (receivable.status === 'canceled') {
    return NextResponse.json({ ok: false, error: 'Receivable cancelado não pode ser cobrado.' }, { status: 409 })
  }

  const accountRes = await resolveAsaasAccountForReceivable({ admin, receivable })
  if (accountRes.error || !accountRes.data?.id) {
    return NextResponse.json(
      {
        ok: false,
        error:
          accountRes.error?.message ||
          'Nenhuma conta financeira Asaas ativa encontrada para esta linha de negócio.',
      },
      { status: 422 }
    )
  }

  const account = accountRes.data as { id: string; name: string; asaas_wallet_id: string | null }
  const person = await resolvePersonFromReceivable({ admin, receivable })
  const customerRes = await resolveAsaasCustomerId({
    admin,
    person,
    customerOverride: body?.customer,
  })
  if (!customerRes.ok) {
    return NextResponse.json({ ok: false, error: customerRes.error }, { status: 422 })
  }

  const chargeCreateRes = await createAsaasCharge({
    customerId: customerRes.asaasCustomerId,
    value: Math.max(Number(receivable.amount_open || receivable.amount_total || 0), 0),
    dueDate: parseDueDate(receivable.due_date) || new Date().toISOString().slice(0, 10),
    description: receivable.title || `Recebível ${receivable.id.slice(0, 8)}`,
    externalReference: receivable.id,
    walletId: account.asaas_wallet_id,
    billingType: normalizedMethod === 'pix' ? 'PIX' : normalizedMethod === 'boleto' ? 'BOLETO' : null,
  })

  if (!chargeCreateRes.ok) {
    return NextResponse.json(
      { ok: false, error: chargeCreateRes.error || 'Falha ao criar cobrança no Asaas.' },
      { status: 502 }
    )
  }

  const asaasChargeId = String(chargeCreateRes.data?.id || '').trim()
  if (!asaasChargeId) {
    return NextResponse.json({ ok: false, error: 'Asaas não retornou charge_id.' }, { status: 502 })
  }

  const pixRes = await fetchAsaasPixQrCode(asaasChargeId)
  const pixPayload = pixRes.ok ? String(pixRes.data?.payload || pixRes.data?.encodedImage || '').trim() : ''

  const status = String(chargeCreateRes.data?.status || '').trim() || null
  const dueDate = parseDueDate(chargeCreateRes.data?.dueDate || receivable.due_date) || null
  const invoiceUrl = String(chargeCreateRes.data?.invoiceUrl || '').trim() || null
  const bankSlipUrl = String(chargeCreateRes.data?.bankSlipUrl || '').trim() || null
  const bankSlipPdf = String(chargeCreateRes.data?.bankSlipPdfUrl || '').trim() || null
  const billingType = String(chargeCreateRes.data?.billingType || chargeCreateRes.data?.billing_type || '').trim() || null

  const chargeUpsertRes = await admin
    .from('asaas_charges')
    .upsert(
      {
        receivable_id: receivable.id,
        financial_account_id: account.id,
        asaas_charge_id: asaasChargeId,
        status,
        due_date: dueDate,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        bank_slip_pdf: bankSlipPdf,
        pix_payload: pixPayload || null,
        payload: {
          charge: chargeCreateRes.data || null,
          pix: pixRes.ok ? pixRes.data || null : null,
        },
      },
      { onConflict: 'receivable_id' }
    )
    .select('id, asaas_charge_id, status, invoice_url, bank_slip_url, bank_slip_pdf, pix_payload, due_date')
    .maybeSingle()

  if (chargeUpsertRes.error || !chargeUpsertRes.data) {
    return NextResponse.json(
      { ok: false, error: chargeUpsertRes.error?.message || 'Erro ao persistir cobrança Asaas.' },
      { status: 500 }
    )
  }

  let collectionMethodId: string | null = null
  const collectionMethodCode = collectionMethodCodeFromCharge({
    billingType,
    pixPayload: pixPayload || null,
    bankSlipUrl,
    bankSlipPdf,
    requestedMethod: normalizedMethod,
  })

  if (collectionMethodCode) {
    const collectionMethodRes = await admin
      .from('collection_methods')
      .select('id, code')
      .in('code', ['boleto', 'pix'])

    if (!collectionMethodRes.error) {
      const matched = (collectionMethodRes.data ?? []).find((row: any) => row?.code === collectionMethodCode)
      collectionMethodId = (matched?.id as string | undefined) ?? null
    }
  }

  await admin
    .from('receivables')
    .update({
      external_provider: 'asaas',
      external_id: asaasChargeId,
      external_status: status,
      due_date: dueDate ?? receivable.due_date,
      collection_method_id: collectionMethodId,
    })
    .eq('id', receivable.id)

  return NextResponse.json({
    ok: true,
    data: {
      receivable_id: receivable.id,
      asaas_charge_id: asaasChargeId,
      status,
      invoice_url: invoiceUrl,
      bank_slip_url: bankSlipUrl,
      bank_slip_pdf: bankSlipPdf,
      pix_payload: pixPayload || null,
      due_date: dueDate,
      account_name: account.name,
    },
  })
}

export async function PATCH(request: Request) {
  const auth = await getManagerContext()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => null)) as ChargePatchBody | null
  const action = String(body?.action || '').trim()
  const asaasChargeIdInput = String(body?.asaas_charge_id || '').trim()
  const receivableIdInput = String(body?.receivable_id || '').trim()
  const dueDate = parseDueDate(body?.due_date)

  if (action !== 'change_due_date' && action !== 'cancel') {
    return NextResponse.json({ ok: false, error: 'action inválida.' }, { status: 400 })
  }
  if (action === 'change_due_date' && !dueDate) {
    return NextResponse.json({ ok: false, error: 'due_date inválida.' }, { status: 400 })
  }

  const admin = createAdminClient()

  let chargeQuery = admin.from('asaas_charges').select('id, receivable_id, asaas_charge_id, status, due_date')
  if (asaasChargeIdInput) {
    chargeQuery = chargeQuery.eq('asaas_charge_id', asaasChargeIdInput)
  } else if (receivableIdInput) {
    chargeQuery = chargeQuery.eq('receivable_id', receivableIdInput)
  } else {
    return NextResponse.json({ ok: false, error: 'Informe asaas_charge_id ou receivable_id.' }, { status: 400 })
  }

  const chargeRes = await chargeQuery.maybeSingle()
  if (chargeRes.error || !chargeRes.data) {
    return NextResponse.json(
      { ok: false, error: chargeRes.error?.message || 'Cobrança Asaas não encontrada.' },
      { status: 404 }
    )
  }

  const charge = chargeRes.data as {
    id: string
    receivable_id: string
    asaas_charge_id: string
    status: string | null
  }

  if (action === 'change_due_date') {
    const updateRes = await updateAsaasChargeDueDate(charge.asaas_charge_id, dueDate!)
    if (!updateRes.ok) {
      return NextResponse.json({ ok: false, error: updateRes.error || 'Erro ao alterar vencimento no Asaas.' }, { status: 502 })
    }

    const nextStatus = String(updateRes.data?.status || charge.status || '').trim() || null
    await admin
      .from('asaas_charges')
      .update({
        status: nextStatus,
        due_date: dueDate,
        payload: {
          last_update: updateRes.data || null,
        },
      })
      .eq('id', charge.id)

    await admin
      .from('receivables')
      .update({
        due_date: dueDate,
        external_status: nextStatus,
      })
      .eq('id', charge.receivable_id)

    return NextResponse.json({
      ok: true,
      data: {
        action,
        asaas_charge_id: charge.asaas_charge_id,
        due_date: dueDate,
        status: nextStatus,
      },
    })
  }

  const cancelRes = await cancelAsaasCharge(charge.asaas_charge_id)
  if (!cancelRes.ok) {
    return NextResponse.json({ ok: false, error: cancelRes.error || 'Erro ao cancelar cobrança no Asaas.' }, { status: 502 })
  }

  const canceledStatus = String(cancelRes.data?.status || 'CANCELED').trim()
  await admin
    .from('asaas_charges')
    .update({
      status: canceledStatus,
      payload: {
        last_cancel: cancelRes.data || null,
      },
    })
    .eq('id', charge.id)

  await admin
    .from('receivables')
    .update({
      status: 'canceled',
      external_status: canceledStatus,
    })
    .eq('id', charge.receivable_id)

  return NextResponse.json({
    ok: true,
    data: {
      action,
      asaas_charge_id: charge.asaas_charge_id,
      status: canceledStatus,
    },
  })
}
