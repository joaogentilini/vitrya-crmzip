export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'

import { ensureUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import { isMissingRelationError } from '@/lib/finance/errors'
import type {
  BusinessLineRow,
  CollectionMethodRow,
  FinancialAccountRow,
  FinancialCategoryRow,
  FinanceSettingsRow,
  PaymentMethodRow,
  ProposalPaymentMethodRow,
  PaymentTermRow,
} from '@/lib/finance/types'

import { FinanceSettingsClient } from './FinanceSettingsClient'

export default async function FinanceSettingsPage() {
  const profile = await ensureUserProfile()
  if (!profile) redirect('/')
  if (profile.is_active === false) redirect('/blocked')
  if (profile.role !== 'admin' && profile.role !== 'gestor') redirect('/dashboard')

  const supabase = await createClient()

  const [linesRes, accountsRes, methodsRes, proposalMethodsRes, collectionMethodsRes, termsRes, categoriesRes, settingsRes] = await Promise.all([
    supabase.from('business_lines').select('*').order('position', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('financial_accounts').select('*').order('created_at', { ascending: true }),
    supabase.from('payment_methods').select('*').order('created_at', { ascending: true }),
    supabase.from('proposal_payment_methods').select('*').order('position', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('collection_methods').select('*').order('position', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('payment_terms').select('*').order('created_at', { ascending: true }),
    supabase.from('financial_categories').select('*').order('direction', { ascending: true }).order('code', { ascending: true }),
    supabase.from('finance_settings').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const errors = [
    linesRes.error,
    accountsRes.error,
    methodsRes.error,
    proposalMethodsRes.error,
    collectionMethodsRes.error,
    termsRes.error,
    categoriesRes.error,
    settingsRes.error,
  ]
  const schemaMissing = errors.some((error) => isMissingRelationError(error))
  const firstError = errors.find((error) => error && !isMissingRelationError(error))

  if (firstError) {
    throw new Error(firstError.message || 'Erro ao carregar configurações financeiras.')
  }

  return (
    <FinanceSettingsClient
      schemaMissing={schemaMissing}
      businessLines={(linesRes.data ?? []) as BusinessLineRow[]}
      accounts={(accountsRes.data ?? []) as FinancialAccountRow[]}
      paymentMethods={(methodsRes.data ?? []) as PaymentMethodRow[]}
      proposalPaymentMethods={(proposalMethodsRes.data ?? []) as ProposalPaymentMethodRow[]}
      collectionMethods={(collectionMethodsRes.data ?? []) as CollectionMethodRow[]}
      paymentTerms={(termsRes.data ?? []) as PaymentTermRow[]}
      financialCategories={(categoriesRes.data ?? []) as FinancialCategoryRow[]}
      financeSettings={(settingsRes.data as FinanceSettingsRow | null) ?? null}
    />
  )
}
