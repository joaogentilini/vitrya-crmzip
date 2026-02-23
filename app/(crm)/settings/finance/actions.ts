'use server'

import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'

function toTrimmed(value: unknown): string {
  return String(value ?? '').trim()
}

function toNullableText(value: unknown): string | null {
  const text = toTrimmed(value)
  return text || null
}

function toNullableNumber(value: unknown): number | null {
  const text = toTrimmed(value).replace(',', '.')
  if (!text) return null
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Number(toTrimmed(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.trunc(parsed)
}

export type BusinessLineInput = {
  id?: string | null
  code: string
  name: string
  is_active: boolean
  position: number
}

export async function upsertBusinessLineAction(input: BusinessLineInput) {
  await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const code = toTrimmed(input.code).toLowerCase()
  if (!code) return { ok: false as const, error: 'Código da linha é obrigatório.' }

  const payload = {
    code,
    name: toTrimmed(input.name) || code,
    is_active: Boolean(input.is_active),
    position: toInt(input.position, 0),
  }

  const query = input.id
    ? supabase.from('business_lines').update(payload).eq('id', input.id).select('*').maybeSingle()
    : supabase.from('business_lines').insert(payload).select('*').maybeSingle()

  const { data, error } = await query
  if (error) return { ok: false as const, error: error.message || 'Erro ao salvar linha de negócio.' }

  revalidatePath('/settings/finance')
  revalidatePath('/erp/financeiro')
  return { ok: true as const, data }
}

export type FinancialAccountInput = {
  id?: string | null
  name: string
  business_line_id?: string | null
  asaas_wallet_id?: string | null
  is_active: boolean
  is_cash_box: boolean
  bank_name?: string | null
  bank_code?: string | null
  branch_number?: string | null
  account_number?: string | null
  account_digit?: string | null
  account_type?: string | null
  pix_key_type?: string | null
  pix_key?: string | null
}

export async function upsertFinancialAccountAction(input: FinancialAccountInput) {
  await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const name = toTrimmed(input.name)
  if (!name) return { ok: false as const, error: 'Nome da conta é obrigatório.' }

  const payload = {
    name,
    business_line_id: toNullableText(input.business_line_id),
    asaas_wallet_id: toNullableText(input.asaas_wallet_id),
    is_active: Boolean(input.is_active),
    is_cash_box: Boolean(input.is_cash_box),
    bank_name: toNullableText(input.bank_name),
    bank_code: toNullableText(input.bank_code),
    branch_number: toNullableText(input.branch_number),
    account_number: toNullableText(input.account_number),
    account_digit: toNullableText(input.account_digit),
    account_type: toNullableText(input.account_type),
    pix_key_type: toNullableText(input.pix_key_type),
    pix_key: toNullableText(input.pix_key),
  }

  const query = input.id
    ? supabase.from('financial_accounts').update(payload).eq('id', input.id).select('*').maybeSingle()
    : supabase.from('financial_accounts').insert(payload).select('*').maybeSingle()

  const { data, error } = await query
  if (error) return { ok: false as const, error: error.message || 'Erro ao salvar conta financeira.' }

  revalidatePath('/settings/finance')
  revalidatePath('/erp/financeiro')
  return { ok: true as const, data }
}

export type PaymentMethodInput = {
  id?: string | null
  code: string
  name: string
  is_active: boolean
  accepts_installments: boolean
}

export async function upsertPaymentMethodAction(input: PaymentMethodInput) {
  await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const code = toTrimmed(input.code).toLowerCase()
  const name = toTrimmed(input.name)
  if (!code) return { ok: false as const, error: 'Código do método é obrigatório.' }
  if (!name) return { ok: false as const, error: 'Nome do método é obrigatório.' }

  const payload = {
    code,
    name,
    is_active: Boolean(input.is_active),
    accepts_installments: Boolean(input.accepts_installments),
  }

  const query = input.id
    ? supabase.from('payment_methods').update(payload).eq('id', input.id).select('*').maybeSingle()
    : supabase.from('payment_methods').insert(payload).select('*').maybeSingle()

  const { data, error } = await query
  if (error) return { ok: false as const, error: error.message || 'Erro ao salvar método de pagamento.' }

  revalidatePath('/settings/finance')
  return { ok: true as const, data }
}

export type CollectionMethodInput = {
  id?: string | null
  code: string
  name: string
  is_active: boolean
  position?: number
}

export async function upsertCollectionMethodAction(input: CollectionMethodInput) {
  await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const code = toTrimmed(input.code).toLowerCase()
  const name = toTrimmed(input.name)
  if (!code) return { ok: false as const, error: 'Código do método de cobrança é obrigatório.' }
  if (!name) return { ok: false as const, error: 'Nome do método de cobrança é obrigatório.' }

  const payload = {
    code,
    name,
    is_active: Boolean(input.is_active),
    position: Math.max(toInt(input.position ?? 0, 0), 0),
  }

  const query = input.id
    ? supabase.from('collection_methods').update(payload).eq('id', input.id).select('*').maybeSingle()
    : supabase.from('collection_methods').insert(payload).select('*').maybeSingle()

  const { data, error } = await query
  if (error) return { ok: false as const, error: error.message || 'Erro ao salvar método de cobrança.' }

  revalidatePath('/settings/finance')
  return { ok: true as const, data }
}

export type PaymentTermInput = {
  id?: string | null
  code: string
  name: string
  installments_count: number
  interval_days: number
  is_active: boolean
}

export async function upsertPaymentTermAction(input: PaymentTermInput) {
  await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const code = toTrimmed(input.code).toLowerCase()
  const name = toTrimmed(input.name)
  if (!code) return { ok: false as const, error: 'Código do prazo é obrigatório.' }
  if (!name) return { ok: false as const, error: 'Nome do prazo é obrigatório.' }

  const installments = Math.max(toInt(input.installments_count, 1), 1)
  const intervalDays = Math.max(toInt(input.interval_days, 30), 1)

  const payload = {
    code,
    name,
    installments_count: installments,
    interval_days: intervalDays,
    is_active: Boolean(input.is_active),
  }

  const query = input.id
    ? supabase.from('payment_terms').update(payload).eq('id', input.id).select('*').maybeSingle()
    : supabase.from('payment_terms').insert(payload).select('*').maybeSingle()

  const { data, error } = await query
  if (error) return { ok: false as const, error: error.message || 'Erro ao salvar prazo.' }

  revalidatePath('/settings/finance')
  return { ok: true as const, data }
}

export type FinancialCategoryInput = {
  id?: string | null
  code: string
  name: string
  direction: 'in' | 'out'
  business_line_id?: string | null
  is_active: boolean
}

export async function upsertFinancialCategoryAction(input: FinancialCategoryInput) {
  await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const code = toTrimmed(input.code).toLowerCase()
  const name = toTrimmed(input.name)
  const direction = input.direction === 'out' ? 'out' : 'in'

  if (!code) return { ok: false as const, error: 'Código da categoria é obrigatório.' }
  if (!name) return { ok: false as const, error: 'Nome da categoria é obrigatório.' }

  const payload = {
    code,
    name,
    direction,
    business_line_id: toNullableText(input.business_line_id),
    is_active: Boolean(input.is_active),
  }

  const query = input.id
    ? supabase.from('financial_categories').update(payload).eq('id', input.id).select('*').maybeSingle()
    : supabase.from('financial_categories').insert(payload).select('*').maybeSingle()

  const { data, error } = await query
  if (error) return { ok: false as const, error: error.message || 'Erro ao salvar categoria.' }

  revalidatePath('/settings/finance')
  return { ok: true as const, data }
}

export type FinanceAutomationInput = {
  finance_automation_enabled: boolean
  auto_generate_sale_distributions: boolean
  auto_generate_rent_distributions: boolean
}

export async function updateFinanceAutomationSettingsAction(input: FinanceAutomationInput) {
  const profile = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const current = await supabase
    .from('finance_settings')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (current.error) {
    return { ok: false as const, error: current.error.message || 'Erro ao carregar configurações financeiras.' }
  }

  const payload = {
    finance_automation_enabled: Boolean(input.finance_automation_enabled),
    auto_generate_sale_distributions: Boolean(input.auto_generate_sale_distributions),
    auto_generate_rent_distributions: Boolean(input.auto_generate_rent_distributions),
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  }

  const writeRes = current.data?.id
    ? await supabase.from('finance_settings').update(payload).eq('id', current.data.id).select('*').maybeSingle()
    : await supabase.from('finance_settings').insert(payload).select('*').maybeSingle()

  if (writeRes.error) {
    return { ok: false as const, error: writeRes.error.message || 'Erro ao atualizar automações financeiras.' }
  }

  revalidatePath('/settings/finance')
  revalidatePath('/erp/financeiro')
  revalidatePath('/erp/financeiro/conciliacao')
  return { ok: true as const, data: writeRes.data ?? null }
}
