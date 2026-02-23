export type BusinessLineCode = 'sale' | 'rent'

export type FinanceSettingsRow = {
  id: string
  finance_automation_enabled: boolean
  auto_generate_sale_distributions: boolean
  auto_generate_rent_distributions: boolean
  updated_at: string | null
  updated_by: string | null
}

export type BusinessLineRow = {
  id: string
  code: BusinessLineCode | string
  name: string
  is_active: boolean
  position: number
}

export type FinancialAccountRow = {
  id: string
  name: string
  business_line_id: string | null
  asaas_wallet_id: string | null
  is_active: boolean
  is_cash_box: boolean
  bank_name: string | null
  bank_code: string | null
  branch_number: string | null
  account_number: string | null
  account_digit: string | null
  account_type: string | null
  pix_key_type: string | null
  pix_key: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type PaymentMethodRow = {
  id: string
  code: string
  name: string
  is_active: boolean
  accepts_installments: boolean
}

export type ProposalPaymentMethodRow = {
  id: string
  code: string
  name: string
  is_active: boolean
  position: number
}

export type CollectionMethodRow = {
  id: string
  code: string
  name: string
  is_active: boolean
  position: number
}

export type PaymentTermRow = {
  id: string
  code: string
  name: string
  installments_count: number
  interval_days: number
  is_active: boolean
}

export type FinancialCategoryRow = {
  id: string
  code: string
  name: string
  direction: 'in' | 'out'
  business_line_id: string | null
  is_active: boolean
}

export type ReceivableRow = {
  id: string
  title: string
  amount_total: number
  amount_open: number
  due_date: string
  status: 'open' | 'partial' | 'paid' | 'overdue' | 'canceled' | string
  business_line_id: string | null
  property_id: string | null
  property_category_id: string | null
  lead_id: string | null
  lead_type_id: string | null
  lead_interest_id: string | null
  lead_source_id: string | null
  broker_user_id: string | null
  financial_category_id: string | null
  payment_method_id: string | null
  proposal_payment_method_id: string | null
  collection_method_id: string | null
  payment_term_id: string | null
  origin_type: string
  origin_id: string | null
  external_provider: string | null
  external_id: string | null
  external_status: string | null
  paid_at: string | null
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PayableRow = {
  id: string
  title: string
  amount_total: number
  amount_open: number
  due_date: string
  status: 'open' | 'partial' | 'paid' | 'overdue' | 'canceled' | string
  business_line_id: string | null
  property_id: string | null
  property_category_id: string | null
  broker_user_id: string | null
  financial_category_id: string | null
  payment_method_id: string | null
  payment_term_id: string | null
  beneficiary_person_id: string | null
  origin_type: string
  origin_id: string | null
  external_provider: string | null
  external_id: string | null
  external_status: string | null
  paid_at: string | null
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PaymentRow = {
  id: string
  direction: 'in' | 'out' | string
  receivable_id: string | null
  payable_id: string | null
  financial_account_id: string
  payment_method_id: string | null
  proposal_payment_method_id: string | null
  collection_method_id: string | null
  amount: number
  paid_at: string
  status: 'pending' | 'confirmed' | 'failed' | 'reversed' | string
  external_provider: string | null
  external_id: string | null
  origin_type: string
  origin_id: string | null
  business_line_id: string | null
  property_id: string | null
  property_category_id: string | null
  broker_user_id: string | null
  distribution_status: 'pending' | 'generated' | 'reverted' | string
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
}
