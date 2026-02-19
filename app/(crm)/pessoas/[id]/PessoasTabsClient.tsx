'use client'

import { useCallback, useEffect, useMemo, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { normalizePersonKindTags, PersonKindTag } from '@/lib/types/people2'
import {
  addBankAccount,
  addHouseholdMember,
  addIncomeSource,
  addLiability,
  createPersonNote,
  deleteIncomeSource,
  deleteLiability,
  removeHouseholdMember,
  searchPeople,
  setPreferredBankAccount,
  updatePersonBasics,
  updatePersonRoles,
  upsertCurrentAddress,
  upsertCompanyProfile,
  upsertFinancingProfile
} from './actions'
import PersonDocumentsClient from '@/app/(crm)/people/[id]/documents/PersonDocumentsClient'

const kindTagLabels: Record<PersonKindTag, string> = {
  proprietario: 'Proprietário',
  corretor: 'Corretor',
  fornecedor: 'Fornecedor',
  parceiro: 'Parceiro',
  interessado_comprador: 'Interessado/Comprador'
}

const allRoleOptions: { value: PersonKindTag; label: string }[] = [
  { value: 'proprietario', label: 'Proprietário' },
  { value: 'corretor', label: 'Corretor' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'parceiro', label: 'Parceiro' },
  { value: 'interessado_comprador', label: 'Interessado/Comprador' }
]

const maritalStatusOptions: { value: string; label: string }[] = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' }
]

// Lista "boa o suficiente" para não travar agora. Depois plugar tabela/enum no banco.
const rgIssuingOrgOptions: { value: string; label: string }[] = [
  { value: 'SSP', label: 'SSP (Secretaria de Segurança Pública)' },
  { value: 'SSP-SP', label: 'SSP-SP' },
  { value: 'SSP-RJ', label: 'SSP-RJ' },
  { value: 'SSP-MG', label: 'SSP-MG' },
  { value: 'SSP-PR', label: 'SSP-PR' },
  { value: 'SSP-RS', label: 'SSP-RS' },
  { value: 'PC', label: 'Polícia Civil' },
  { value: 'DETRAN', label: 'DETRAN' },
  { value: 'DIC', label: 'DIC (Identificação Civil)' },
  { value: 'IFP', label: 'IFP' },
  { value: 'IGP', label: 'IGP' },
  { value: 'SDS', label: 'SDS' },
  { value: 'PM', label: 'Polícia Militar' },
  { value: 'MB', label: 'Marinha do Brasil' },
  { value: 'EB', label: 'Exército Brasileiro' },
  { value: 'FAB', label: 'Força Aérea Brasileira' }
]

const leadStatusLabels: Record<string, string> = {
  open: 'Aberto',
  won: 'Comprou',
  lost: 'Não Comprou'
}

const proposalStatusLabels: Record<string, string> = {
  draft: 'Rascunho',
  in_review: 'Em análise',
  counterproposal: 'Contraproposta',
  approved: 'Aprovada',
  rejected: 'Rejeitada'
}

const negotiationInvolvementLabels: Record<string, string> = {
  buyer: 'Comprador',
  owner: 'Proprietario',
  buyer_owner: 'Comprador/Proprietario',
  participant: 'Participante'
}

interface PersonProfile {
  id: string
  full_name: string | null
  email: string | null
}

export interface PersonRecord {
  id: string
  full_name: string | null
  email: string | null
  phone_e164: string | null
  document_id: string | null
  notes: string | null
  kind_tags: string[] | null
  owner_profile_id: string | null
  assigned_to?: string | null
  created_by_profile_id: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

type BrokerRow = { id?: string; full_name?: string | null; email?: string | null }
type LeadRow = { id?: string; title?: string | null; status?: string | null; created_at?: string | null }
type AnyRow = Record<string, unknown>

type FinancingProfile = Record<string, unknown> | null
type CompanyProfile = Record<string, unknown> | null
type AddressRow = Record<string, unknown>
type IncomeSourceRow = Record<string, unknown>
type LiabilityRow = Record<string, unknown>
type BankAccountRow = Record<string, unknown>
type HouseholdMemberRow = Record<string, unknown> & {
  member?: {
    id?: string | null
    full_name?: string | null
    email?: string | null
    phone_e164?: string | null
  } | null
}

interface PessoasTabsClientProps {
  person: PersonRecord
  creatorProfile: PersonProfile | null
  assignedProfile: PersonProfile | null
  currentUserRole: string | null
  brokers: BrokerRow[]
  properties: AnyRow[]
  negotiations: AnyRow[]
  relatedLeads: LeadRow[]
  links: AnyRow[]
  timeline: AnyRow[]
  documents: AnyRow[]
  financingProfile: FinancingProfile
  companyProfile: CompanyProfile
  addresses: AddressRow[]
  incomeSources: IncomeSourceRow[]
  liabilities: LiabilityRow[]
  bankAccounts: BankAccountRow[]
  householdMembers: HouseholdMemberRow[]
  errors: {
    links: string | null
    timeline: string | null
    documents: string | null
  }
}

function isLikelyDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)
}

function formatValue(value: unknown, key?: string) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'string') {
    if ((key && key.endsWith('_at')) || isLikelyDate(value)) {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
    }
    return value
  }
  if (typeof value === 'number') return value.toString()
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const formatCurrencyBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const resolveNegotiationValue = (row: AnyRow) => {
  const numericKeys = [
    'proposal_total_value',
    'total_value',
    'value',
    'amount',
    'price',
    'sale_value',
    'rent_price'
  ]
  for (const key of numericKeys) {
    const value = row?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return formatCurrencyBRL(value)
    }
  }
  const fallback = row?.budget_range ?? row?.budget ?? row?.value_text
  return fallback ? String(fallback) : '—'
}

const toNull = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

const toDigits = (value?: string | null) => (value ? value.replace(/\D/g, '') : '')

function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function formatCPF(value: string) {
  const d = toDigits(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function formatCNPJ(value: string) {
  const d = toDigits(value).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function normalizePhoneE164FromBR(value: string) {
  const d = toDigits(value)
  if (!d) return ''
  // se já vier com 55, mantém; se não, assume BR
  const digits = d.startsWith('55') ? d : `55${d}`
  return `+${digits}`
}

function formatPhoneBRFromE164(value?: string | null) {
  const d = toDigits(value || '')
  const br = d.startsWith('55') ? d.slice(2) : d
  const ddd = br.slice(0, 2)
  const rest = br.slice(2)

  if (!ddd) return ''
  // celular 9 dígitos + fixo 8 dígitos
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`
  if (rest.length <= 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`
}

function pickColumns(rows: AnyRow[], preferred: string[]) {
  const keys = new Set(rows.flatMap((row) => Object.keys(row)))
  const selected = preferred.filter((key) => keys.has(key))
  if (selected.length > 0) return selected
  return Array.from(keys).filter((key) => key !== 'person_id').slice(0, 6)
}

function getAllColumns(rows: AnyRow[]) {
  const keys = new Set(rows.flatMap((row) => Object.keys(row)))
  return Array.from(keys).filter((key) => key !== 'person_id')
}

function DataTable({
  title,
  rows,
  emptyLabel,
  error
}: {
  title: string
  rows: AnyRow[]
  emptyLabel: string
  error?: string | null
}) {
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--destructive)]">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">{emptyLabel}</p>
        </CardContent>
      </Card>
    )
  }

  const columns = pickColumns(rows, [
    'title',
    'name',
    'relationship',
    'link_type',
    'type',
    'entity_type',
    'entity_id',
    'status',
    'notes',
    'occurred_at',
    'issued_at',
    'expires_at',
    'created_at'
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="py-2 pr-4 text-xs font-medium uppercase text-[var(--muted-foreground)]"
                  >
                    {column.replaceAll('_', ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={(row.id as string) ?? `row-${index}`} className="border-b border-[var(--border)]">
                  {columns.map((column) => (
                    <td key={column} className="py-2 pr-4">
                      {formatValue(row[column], column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function FullDataTable({
  title,
  rows,
  emptyLabel
}: {
  title: string
  rows: AnyRow[]
  emptyLabel: string
}) {
  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">{emptyLabel}</p>
        </CardContent>
      </Card>
    )
  }

  const columns = getAllColumns(rows)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="py-2 pr-4 text-xs font-medium uppercase text-[var(--muted-foreground)]"
                  >
                    {column.replaceAll('_', ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={(row.id as string) ?? `row-${index}`} className="border-b border-[var(--border)]">
                  {columns.map((column) => (
                    <td key={column} className="py-2 pr-4">
                      {formatValue(row[column], column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function KeyValueList({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)
  if (entries.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">Sem dados.</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key}>
          <p className="text-xs text-[var(--muted-foreground)]">{key}</p>
          <p className="text-sm font-medium text-[var(--foreground)]">{formatValue(value, key)}</p>
        </div>
      ))}
    </div>
  )
}

export default function PessoasTabsClient({
  person,
  creatorProfile,
  assignedProfile,
  currentUserRole,
  brokers,
  properties,
  negotiations,
  relatedLeads,
  links,
  timeline,
  documents: _documents,
  financingProfile,
  companyProfile,
  addresses,
  incomeSources,
  liabilities,
  bankAccounts,
  householdMembers,
  errors
}: PessoasTabsClientProps) {
  const router = useRouter()
  const { success: showSuccess, error: showError } = useToast()

  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()

  const [isEditingBasics, setIsEditingBasics] = useState(false)
  const [basicsSaving, startBasicsTransition] = useTransition()

  const resolvePersonType = useCallback(() => {
    const companyRow = companyProfile as AnyRow | null
    const financingRow = financingProfile as AnyRow | null
    const documentDigits = toDigits(person.document_id ?? '')

    if (
      companyRow?.cnpj ||
      companyRow?.legal_name ||
      companyRow?.trade_name ||
      companyRow?.state_registration ||
      companyRow?.municipal_registration
    ) {
      return 'PJ' as const
    }

    if (financingRow?.cpf || financingRow?.rg || financingRow?.rg_issuing_org) {
      return 'PF' as const
    }

    return documentDigits.length === 14 ? ('PJ' as const) : ('PF' as const)
  }, [companyProfile, financingProfile, person.document_id])

  const [personType, setPersonType] = useState<'PF' | 'PJ'>(() => resolvePersonType())

  const [rolesDraft, setRolesDraft] = useState<PersonKindTag[]>(
    normalizePersonKindTags(person.kind_tags)
  )
  const [isEditingRoles, setIsEditingRoles] = useState(false)
  const [rolesSaving, startRolesTransition] = useTransition()

  const [basicsForm, setBasicsForm] = useState({
    full_name: person.full_name ?? '',
    email: person.email ?? '',
    // UI em BR (DDD) e salva E.164
    phone_display: formatPhoneBRFromE164(person.phone_e164),
    notes: person.notes ?? '',
    assigned_to: person.assigned_to ?? ''
  })

  const [financingSaving, startFinancingTransition] = useTransition()
  const [financingForm, setFinancingForm] = useState({
    cpf: formatCPF(asText((financingProfile as AnyRow | null)?.cpf ?? '')),
    rg: asText((financingProfile as AnyRow | null)?.rg ?? ''),
    rg_issuing_org: asText((financingProfile as AnyRow | null)?.rg_issuing_org ?? ''),
    birth_date: asText((financingProfile as AnyRow | null)?.birth_date ?? ''),
    marital_status: asText((financingProfile as AnyRow | null)?.marital_status ?? ''),
    property_regime: asText((financingProfile as AnyRow | null)?.property_regime ?? ''),
    nationality: asText((financingProfile as AnyRow | null)?.nationality ?? ''),
    profession: asText((financingProfile as AnyRow | null)?.profession ?? ''),
    education_level: asText((financingProfile as AnyRow | null)?.education_level ?? ''),
    mother_name: asText((financingProfile as AnyRow | null)?.mother_name ?? '')
  })

  const [companyForm, setCompanyForm] = useState({
    cnpj: formatCNPJ(asText((companyProfile as AnyRow | null)?.cnpj ?? '')),
    legal_name: asText((companyProfile as AnyRow | null)?.legal_name ?? ''),
    trade_name: asText((companyProfile as AnyRow | null)?.trade_name ?? ''),
    state_registration: asText((companyProfile as AnyRow | null)?.state_registration ?? ''),
    municipal_registration: asText((companyProfile as AnyRow | null)?.municipal_registration ?? '')
  })

  const financingCpf = asText((financingProfile as AnyRow | null)?.cpf ?? '')
  const financingRg = asText((financingProfile as AnyRow | null)?.rg ?? '')
  const financingRgIssuingOrg = asText((financingProfile as AnyRow | null)?.rg_issuing_org ?? '')
  const financingBirthDate = asText((financingProfile as AnyRow | null)?.birth_date ?? '')
  const financingMaritalStatus = asText((financingProfile as AnyRow | null)?.marital_status ?? '')

  const companyCnpj = asText((companyProfile as AnyRow | null)?.cnpj ?? '')
  const companyLegalName = asText((companyProfile as AnyRow | null)?.legal_name ?? '')
  const companyTradeName = asText((companyProfile as AnyRow | null)?.trade_name ?? '')
  const companyStateRegistration = asText((companyProfile as AnyRow | null)?.state_registration ?? '')
  const companyMunicipalRegistration = asText(
    (companyProfile as AnyRow | null)?.municipal_registration ?? ''
  )

  // "bastidor": se ainda não tiver CPF/CNPJ, tenta inferir do legado sem expor "CPF legado".
  const legacyDocumentDigits = toDigits(person.document_id ?? '')
  const cpfDisplay = formatCPF(financingCpf || (legacyDocumentDigits.length === 11 ? legacyDocumentDigits : ''))
  const cnpjDisplay = formatCNPJ(companyCnpj || (legacyDocumentDigits.length === 14 ? legacyDocumentDigits : ''))

  const currentAddress = addresses.find((row) => row.kind === 'current') ?? null
  const [addressSaving, startAddressTransition] = useTransition()
  const [addressForm, setAddressForm] = useState({
    street: (currentAddress?.street as string) ?? '',
    number: (currentAddress?.number as string) ?? '',
    complement: (currentAddress?.complement as string) ?? '',
    neighborhood: (currentAddress?.neighborhood as string) ?? '',
    city: (currentAddress?.city as string) ?? '',
    state: (currentAddress?.state as string) ?? '',
    postal_code: (currentAddress?.postal_code as string) ?? '',
    residence_since: (currentAddress?.residence_since as string) ?? '',
    residence_months: (currentAddress?.residence_months as string) ?? ''
  })

  const [incomeForm, setIncomeForm] = useState({
    income_type: '',
    employer_name: '',
    employer_cnpj: '',
    gross_monthly_income: '',
    other_monthly_income: '',
    notes: ''
  })
  const [incomeSaving, startIncomeTransition] = useTransition()

  const [liabilityForm, setLiabilityForm] = useState({
    kind: '',
    monthly_amount: '',
    creditor: '',
    notes: ''
  })
  const [liabilitySaving, startLiabilityTransition] = useTransition()

  const [bankForm, setBankForm] = useState({
    bank_name: '',
    agency: '',
    account_number: '',
    account_type: '',
    is_preferred: false
  })
  const [bankSaving, startBankTransition] = useTransition()

  const [householdQuery, setHouseholdQuery] = useState('')
  const [householdResults, setHouseholdResults] = useState<AnyRow[]>([])
  const [householdSaving, startHouseholdTransition] = useTransition()
  const [relationshipInput, setRelationshipInput] = useState('')

  useEffect(() => {
    if (isEditingBasics) return
    setBasicsForm({
      full_name: person.full_name ?? '',
      email: person.email ?? '',
      phone_display: formatPhoneBRFromE164(person.phone_e164),
      notes: person.notes ?? '',
      assigned_to: person.assigned_to ?? ''
    })
    setRolesDraft(normalizePersonKindTags(person.kind_tags))
  }, [
    isEditingBasics,
    person.full_name,
    person.email,
    person.phone_e164,
    person.notes,
    person.assigned_to,
    person.kind_tags
  ])

  useEffect(() => {
    if (isEditingBasics) return
    setPersonType(resolvePersonType())
  }, [isEditingBasics, resolvePersonType])

  useEffect(() => {
    setFinancingForm({
      cpf: formatCPF(asText((financingProfile as AnyRow | null)?.cpf ?? '')),
      rg: asText((financingProfile as AnyRow | null)?.rg ?? ''),
      rg_issuing_org: asText((financingProfile as AnyRow | null)?.rg_issuing_org ?? ''),
      birth_date: asText((financingProfile as AnyRow | null)?.birth_date ?? ''),
      marital_status: asText((financingProfile as AnyRow | null)?.marital_status ?? ''),
      property_regime: asText((financingProfile as AnyRow | null)?.property_regime ?? ''),
      nationality: asText((financingProfile as AnyRow | null)?.nationality ?? ''),
      profession: asText((financingProfile as AnyRow | null)?.profession ?? ''),
      education_level: asText((financingProfile as AnyRow | null)?.education_level ?? ''),
      mother_name: asText((financingProfile as AnyRow | null)?.mother_name ?? '')
    })
  }, [financingProfile])

  useEffect(() => {
    setCompanyForm({
      cnpj: formatCNPJ(asText((companyProfile as AnyRow | null)?.cnpj ?? '')),
      legal_name: asText((companyProfile as AnyRow | null)?.legal_name ?? ''),
      trade_name: asText((companyProfile as AnyRow | null)?.trade_name ?? ''),
      state_registration: asText((companyProfile as AnyRow | null)?.state_registration ?? ''),
      municipal_registration: asText((companyProfile as AnyRow | null)?.municipal_registration ?? '')
    })
  }, [companyProfile])

  useEffect(() => {
    setAddressForm({
      street: (currentAddress?.street as string) ?? '',
      number: (currentAddress?.number as string) ?? '',
      complement: (currentAddress?.complement as string) ?? '',
      neighborhood: (currentAddress?.neighborhood as string) ?? '',
      city: (currentAddress?.city as string) ?? '',
      state: (currentAddress?.state as string) ?? '',
      postal_code: (currentAddress?.postal_code as string) ?? '',
      residence_since: (currentAddress?.residence_since as string) ?? '',
      residence_months: (currentAddress?.residence_months as string) ?? ''
    })
  }, [currentAddress])

  const assignedOptions = useMemo(() => {
    const options = (brokers ?? [])
      .filter((row) => row?.id)
      .map((row) => ({
        value: row.id as string,
        label: row.full_name || row.email || (row.id as string)
      }))

    if (person.assigned_to && !options.some((opt) => opt.value === person.assigned_to)) {
      options.unshift({
        value: person.assigned_to,
        label: assignedProfile?.full_name || assignedProfile?.email || person.assigned_to
      })
    }

    options.unshift({ value: '', label: 'Sem atribuição' })
    return options
  }, [assignedProfile, brokers, person.assigned_to])
  const canManageOwner = currentUserRole === 'admin' || currentUserRole === 'gestor'

  const handleCreateNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    startTransition(async () => {
      try {
        await createPersonNote(person.id, noteTitle, noteBody)
        setNoteTitle('')
        setNoteBody('')
        showSuccess('Nota criada.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao criar nota.'
        setFormError(message)
      }
    })
  }

  const handleBasicsCancel = () => {
    setBasicsForm({
      full_name: person.full_name ?? '',
      email: person.email ?? '',
      phone_display: formatPhoneBRFromE164(person.phone_e164),
      notes: person.notes ?? '',
      assigned_to: person.assigned_to ?? ''
    })
    setPersonType(resolvePersonType())
    setRolesDraft(normalizePersonKindTags(person.kind_tags))
    setIsEditingRoles(false)
    setIsEditingBasics(false)
  }

  const handleBasicsSave = () => {
    startBasicsTransition(async () => {
      try {
        const phoneToSave = basicsForm.phone_display.trim()
          ? normalizePhoneE164FromBR(basicsForm.phone_display)
          : null

        const basicsPayload: {
          full_name: string | null
          email: string | null
          phone_e164: string | null
          notes: string | null
          assigned_to?: string | null
        } = {
          full_name: toNull(basicsForm.full_name),
          email: toNull(basicsForm.email),
          phone_e164: phoneToSave,
          notes: toNull(basicsForm.notes)
        }

        if (canManageOwner) {
          basicsPayload.assigned_to = toNull(basicsForm.assigned_to)
        }

        await updatePersonBasics(person.id, basicsPayload)

        if (personType === 'PF') {
          await upsertFinancingProfile(person.id, {
            cpf: toDigits(financingForm.cpf) || null,
            rg: toNull(financingForm.rg),
            rg_issuing_org: toNull(financingForm.rg_issuing_org),
            birth_date: toNull(financingForm.birth_date),
            marital_status: toNull(financingForm.marital_status)
          })
        } else {
          await upsertCompanyProfile(person.id, {
            cnpj: toDigits(companyForm.cnpj) || null,
            legal_name: toNull(companyForm.legal_name),
            trade_name: toNull(companyForm.trade_name),
            state_registration: toNull(companyForm.state_registration),
            municipal_registration: toNull(companyForm.municipal_registration)
          })
        }

        showSuccess('Pessoa atualizada.')
        setIsEditingBasics(false)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar pessoa.'
        showError(message)
      }
    })
  }

  const handleFinancingSave = () => {
    startFinancingTransition(async () => {
      try {
        await upsertFinancingProfile(person.id, {
          cpf: toDigits(financingForm.cpf) || null,
          rg: toNull(financingForm.rg),
          rg_issuing_org: toNull(financingForm.rg_issuing_org),
          birth_date: toNull(financingForm.birth_date),
          marital_status: toNull(financingForm.marital_status),
          property_regime: toNull(financingForm.property_regime),
          nationality: toNull(financingForm.nationality),
          profession: toNull(financingForm.profession),
          education_level: toNull(financingForm.education_level),
          mother_name: toNull(financingForm.mother_name)
        })
        showSuccess('Dados do proponente atualizados.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar financiamento.'
        showError(message)
      }
    })
  }

  const handleAddressSave = () => {
    startAddressTransition(async () => {
      try {
        await upsertCurrentAddress(person.id, {
          street: toNull(addressForm.street),
          number: toNull(addressForm.number),
          complement: toNull(addressForm.complement),
          neighborhood: toNull(addressForm.neighborhood),
          city: toNull(addressForm.city),
          state: toNull(addressForm.state),
          postal_code: toNull(addressForm.postal_code),
          residence_since: toNull(addressForm.residence_since),
          residence_months: toNull(addressForm.residence_months)
        })
        showSuccess('Endereço atualizado.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar endereço.'
        showError(message)
      }
    })
  }

  const handleAddIncome = () => {
    startIncomeTransition(async () => {
      try {
        await addIncomeSource(person.id, {
          income_type: toNull(incomeForm.income_type),
          employer_name: toNull(incomeForm.employer_name),
          employer_cnpj: toNull(incomeForm.employer_cnpj),
          gross_monthly_income: toNull(incomeForm.gross_monthly_income),
          other_monthly_income: toNull(incomeForm.other_monthly_income),
          notes: toNull(incomeForm.notes)
        })
        setIncomeForm({
          income_type: '',
          employer_name: '',
          employer_cnpj: '',
          gross_monthly_income: '',
          other_monthly_income: '',
          notes: ''
        })
        showSuccess('Renda adicionada.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao adicionar renda.'
        showError(message)
      }
    })
  }

  const handleAddLiability = () => {
    startLiabilityTransition(async () => {
      try {
        await addLiability(person.id, {
          kind: toNull(liabilityForm.kind),
          monthly_amount: toNull(liabilityForm.monthly_amount),
          creditor: toNull(liabilityForm.creditor),
          notes: toNull(liabilityForm.notes)
        })
        setLiabilityForm({ kind: '', monthly_amount: '', creditor: '', notes: '' })
        showSuccess('Comprometimento adicionado.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao adicionar comprometimento.'
        showError(message)
      }
    })
  }

  const handleAddBankAccount = () => {
    startBankTransition(async () => {
      try {
        await addBankAccount(person.id, {
          bank_name: toNull(bankForm.bank_name),
          agency: toNull(bankForm.agency),
          account_number: toNull(bankForm.account_number),
          account_type: toNull(bankForm.account_type),
          is_preferred: bankForm.is_preferred
        })
        setBankForm({
          bank_name: '',
          agency: '',
          account_number: '',
          account_type: '',
          is_preferred: false
        })
        showSuccess('Conta adicionada.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao adicionar conta.'
        showError(message)
      }
    })
  }

  const handleSearchHousehold = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startHouseholdTransition(async () => {
      try {
        const results = await searchPeople(householdQuery)
        setHouseholdResults(results as AnyRow[])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao buscar pessoas.'
        showError(message)
      }
    })
  }

  const handleAddHouseholdMember = (memberId: string) => {
    startHouseholdTransition(async () => {
      try {
        await addHouseholdMember(person.id, memberId, toNull(relationshipInput) || null)
        setRelationshipInput('')
        setHouseholdQuery('')
        setHouseholdResults([])
        showSuccess('Membro adicionado.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao adicionar membro.'
        showError(message)
      }
    })
  }

  const handleDeleteIncome = (id?: string | null) => {
    if (!id) return
    startIncomeTransition(async () => {
      try {
        await deleteIncomeSource(id)
        showSuccess('Renda removida.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao remover renda.'
        showError(message)
      }
    })
  }

  const handleDeleteLiability = (id?: string | null) => {
    if (!id) return
    startLiabilityTransition(async () => {
      try {
        await deleteLiability(id)
        showSuccess('Comprometimento removido.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao remover comprometimento.'
        showError(message)
      }
    })
  }

  const handleSetPreferred = (id?: string | null) => {
    if (!id) return
    startBankTransition(async () => {
      try {
        await setPreferredBankAccount(id)
        showSuccess('Conta preferida atualizada.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar conta preferida.'
        showError(message)
      }
    })
  }

  const handleRemoveHouseholdMember = (id?: string | null) => {
    if (!id) return
    startHouseholdTransition(async () => {
      try {
        await removeHouseholdMember(id)
        showSuccess('Membro removido.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao remover membro.'
        showError(message)
      }
    })
  }

  const handleRolesSave = () => {
    startRolesTransition(async () => {
      try {
        const normalized = normalizePersonKindTags(rolesDraft)
        await updatePersonRoles(person.id, normalized)
        showSuccess('Cliente atualizado.')
        setIsEditingRoles(false)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar cliente.'
        showError(message)
      }
    })
  }

  const handleRolesCancel = () => {
    setRolesDraft(normalizePersonKindTags(person.kind_tags))
    setIsEditingRoles(false)
  }

  const toggleRole = (role: PersonKindTag) => {
    setRolesDraft((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  return (
    <Tabs defaultValue="dados">
      <TabsList>
        <TabsTrigger value="dados">Dados</TabsTrigger>
        <TabsTrigger value="properties">Imóveis</TabsTrigger>
        <TabsTrigger value="negotiations">Negocios</TabsTrigger>
        <TabsTrigger value="relationships">Relacionamentos</TabsTrigger>
        <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
        <TabsTrigger value="documents">Documentos</TabsTrigger>
        <TabsTrigger value="financial">Financiamento</TabsTrigger>
        <TabsTrigger value="settings">Configurações</TabsTrigger>
      </TabsList>

      <TabsContent value="dados">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Dados básicos</CardTitle>
              <div className="flex flex-wrap gap-2">
                {!isEditingBasics ? (
                  <Button variant="outline" onClick={() => setIsEditingBasics(true)}>
                    Editar
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleBasicsSave} disabled={basicsSaving}>
                      {basicsSaving ? 'Salvando...' : 'Salvar'}
                    </Button>
                    <Button variant="ghost" onClick={handleBasicsCancel} disabled={basicsSaving}>
                      Cancelar
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {isEditingBasics ? (
                <>
                  <Input
                    label="Nome completo"
                    value={basicsForm.full_name}
                    onChange={(event) =>
                      setBasicsForm((prev) => ({ ...prev, full_name: event.target.value }))
                    }
                  />

                  <Input
                    label="E-mail"
                    value={basicsForm.email}
                    onChange={(event) => setBasicsForm((prev) => ({ ...prev, email: event.target.value }))}
                  />

                  <Input
                    label="Telefone"
                    value={basicsForm.phone_display}
                    onChange={(event) =>
                      setBasicsForm((prev) => ({
                        ...prev,
                        phone_display: formatPhoneBRFromE164(normalizePhoneE164FromBR(event.target.value))
                      }))
                    }
                    placeholder="(11) 98888-7777"
                  />

                  <Select
                    label="Tipo de pessoa"
                    options={[
                      { value: 'PF', label: 'PF - Pessoa Física' },
                      { value: 'PJ', label: 'PJ - Pessoa Jurídica' }
                    ]}
                    value={personType}
                    onChange={(event) =>
                      setPersonType((event.target as HTMLSelectElement).value as 'PF' | 'PJ')
                    }
                  />

                  {personType === 'PF' ? (
                    <>
                      <Input
                        label="CPF"
                        value={financingForm.cpf}
                        onChange={(event) =>
                          setFinancingForm((prev) => ({ ...prev, cpf: formatCPF(event.target.value) }))
                        }
                        placeholder="000.000.000-00"
                      />

                      <Input
                        label="RG"
                        value={financingForm.rg}
                        onChange={(event) => setFinancingForm((prev) => ({ ...prev, rg: event.target.value }))}
                      />

                      <Select
                        label="Órgão emissor"
                        options={[{ value: '', label: 'Selecione...' }, ...rgIssuingOrgOptions]}
                        value={financingForm.rg_issuing_org}
                        onChange={(event) =>
                          setFinancingForm((prev) => ({
                            ...prev,
                            rg_issuing_org: (event.target as HTMLSelectElement).value
                          }))
                        }
                      />

                      <Select
                        label="Estado civil"
                        options={[{ value: '', label: 'Selecione...' }, ...maritalStatusOptions]}
                        value={financingForm.marital_status}
                        onChange={(event) =>
                          setFinancingForm((prev) => ({
                            ...prev,
                            marital_status: (event.target as HTMLSelectElement).value
                          }))
                        }
                      />

                      <Input
                        label="Nascimento"
                        type="date"
                        value={financingForm.birth_date}
                        onChange={(event) =>
                          setFinancingForm((prev) => ({ ...prev, birth_date: event.target.value }))
                        }
                      />
                    </>
                  ) : (
                    <>
                      <Input
                        label="CNPJ"
                        value={companyForm.cnpj}
                        onChange={(event) =>
                          setCompanyForm((prev) => ({ ...prev, cnpj: formatCNPJ(event.target.value) }))
                        }
                        placeholder="00.000.000/0000-00"
                      />

                      <Input
                        label="Razão social"
                        value={companyForm.legal_name}
                        onChange={(event) =>
                          setCompanyForm((prev) => ({ ...prev, legal_name: event.target.value }))
                        }
                      />

                      <Input
                        label="Nome fantasia"
                        value={companyForm.trade_name}
                        onChange={(event) =>
                          setCompanyForm((prev) => ({ ...prev, trade_name: event.target.value }))
                        }
                      />

                      <Input
                        label="IE"
                        value={companyForm.state_registration}
                        onChange={(event) =>
                          setCompanyForm((prev) => ({ ...prev, state_registration: event.target.value }))
                        }
                      />

                      <Input
                        label="IM"
                        value={companyForm.municipal_registration}
                        onChange={(event) =>
                          setCompanyForm((prev) => ({
                            ...prev,
                            municipal_registration: event.target.value
                          }))
                        }
                      />
                    </>
                  )}

                  {canManageOwner ? (
                    <Select
                      label="Responsável Atual"
                      options={assignedOptions}
                      value={basicsForm.assigned_to}
                      onChange={(event) =>
                        setBasicsForm((prev) => ({
                          ...prev,
                          assigned_to: (event.target as HTMLSelectElement).value
                        }))
                      }
                    />
                  ) : (
                    <Input
                      label="Responsável Atual"
                      value={
                        assignedProfile?.full_name ||
                        assignedProfile?.email ||
                        basicsForm.assigned_to ||
                        'Sem atribuição'
                      }
                      disabled
                      hint="Somente admin/gestor pode alterar o responsável."
                    />
                  )}

                  <div className="sm:col-span-2 lg:col-span-3">
                    <Textarea
                      label="Observações"
                      value={basicsForm.notes}
                      onChange={(event) =>
                        setBasicsForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">Nome completo</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">{person.full_name || '—'}</p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">E-mail</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">{person.email || '—'}</p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">Telefone</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {formatPhoneBRFromE164(person.phone_e164) || '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">Tipo de pessoa</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {personType === 'PJ' ? 'PJ - Pessoa Jurídica' : 'PF - Pessoa Física'}
                    </p>
                  </div>

                  {personType === 'PF' ? (
                    <>
                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">CPF</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">{cpfDisplay || '—'}</p>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">RG</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">{financingRg || '—'}</p>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">Órgão emissor</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {financingRgIssuingOrg || '—'}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">Estado civil</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {financingMaritalStatus || '—'}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">Nascimento</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {financingBirthDate ? formatValue(financingBirthDate, 'birth_date') : '—'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">CNPJ</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">{cnpjDisplay || '—'}</p>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">Razão social</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">{companyLegalName || '—'}</p>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">Nome fantasia</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">{companyTradeName || '—'}</p>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">IE</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">{companyStateRegistration || '—'}</p>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">IM</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {companyMunicipalRegistration || '—'}
                        </p>
                      </div>
                    </>
                  )}

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">Responsável Atual</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {assignedProfile?.full_name || assignedProfile?.email || person.assigned_to || '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">Criado por</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {creatorProfile?.full_name || creatorProfile?.email || person.created_by_profile_id || '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">Criado em</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {formatValue(person.created_at, 'created_at')}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">Atualizado em</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {formatValue(person.updated_at, 'updated_at')}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">Cliente</CardTitle>
              {!isEditingRoles ? (
                <Button variant="outline" onClick={() => setIsEditingRoles(true)}>
                  Editar
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button onClick={handleRolesSave} disabled={rolesSaving}>
                    {rolesSaving ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button variant="ghost" onClick={handleRolesCancel} disabled={rolesSaving}>
                    Cancelar
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!isEditingRoles ? (
                (rolesDraft?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {rolesDraft.map((role) => (
                      <Badge key={role} variant="secondary">
                        {kindTagLabels[role]}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">Nenhum papel associado.</p>
                )
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allRoleOptions.map((opt) => {
                    const active = rolesDraft.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleRole(opt.value)}
                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                          active
                            ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]'
                            : 'bg-transparent text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--accent)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">Leads relacionados</CardTitle>
              <Link href={`/leads#new?person_id=${person.id}`}>
                <Button variant="outline">Adicionar lead</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {relatedLeads.length > 0 ? (
                <div className="space-y-2">
                  {relatedLeads.map((lead, idx) => {
                    const id = lead.id ?? `lead-${idx}`
                    const status = lead.status || 'open'

                    return (
                      <Link
                        key={id}
                        href={`/leads/${lead.id}`}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm hover:bg-[var(--accent)] transition-colors"
                      >
                        <div>
                          <p className="font-medium text-[var(--foreground)]">{lead.title || 'Lead'}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {formatValue(lead.created_at ?? '', 'created_at')}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-[var(--muted-foreground)]">
                          {leadStatusLabels[status] || status}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhum lead relacionado.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="properties">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Imóveis vinculados</CardTitle>
          </CardHeader>
          <CardContent>
            {properties.length > 0 ? (
              <div className="space-y-2">
                {properties.map((property, idx) => {
                  const id = String(property.id ?? `property-${idx}`)
                  const title =
                    (property.title as string | null) ||
                    (property.name as string | null) ||
                    `Imóvel ${id.slice(0, 6)}`
                  const location = [property.neighborhood, property.city]
                    .filter(Boolean)
                    .join(' • ')
                  return (
                    <Link
                      key={id}
                      href={`/properties/${id}`}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm hover:bg-[var(--accent)] transition-colors"
                    >
                      <div>
                        <p className="font-medium text-[var(--foreground)]">{title}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{location || '—'}</p>
                      </div>
                      <span className="text-xs font-medium text-[var(--muted-foreground)]">
                        {property.status ? String(property.status) : '—'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Nenhum imóvel encontrado para esta pessoa.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="negotiations">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Negocios (propostas)</CardTitle>
          </CardHeader>
          <CardContent>
            {negotiations.length > 0 ? (
              <div className="space-y-2">
                {negotiations.map((negotiation, idx) => {
                  const negotiationId = String(negotiation.id ?? `negotiation-${idx}`)
                  const propertyId = negotiation.property_id as string | null | undefined
                  const proposalId = negotiation.proposal_id as string | null | undefined
                  const propertyTitle =
                    (negotiation.property_title as string | null) ||
                    ((negotiation.property as any)?.title as string | null) ||
                    (propertyId ? `Imóvel ${propertyId.slice(0, 6)}` : 'Imóvel não informado')
                  const proposalStatus = String(negotiation.proposal_status ?? negotiation.status ?? 'draft')
                  const proposalStatusLabel = proposalStatusLabels[proposalStatus] || proposalStatus
                  const dateLabel = formatValue(
                    negotiation.proposal_updated_at ?? negotiation.proposal_created_at ?? negotiation.created_at ?? '',
                    'created_at'
                  )
                  const valueLabel = resolveNegotiationValue(negotiation as AnyRow)
                  const involvement = String(negotiation.negotiation_involvement ?? 'participant')
                  const involvementLabel = negotiationInvolvementLabels[involvement] || involvement
                  const proposalTitle =
                    (negotiation.proposal_title as string | null) ||
                    (proposalId ? `Proposta ${proposalId.slice(0, 8)}` : `Negocio ${negotiationId.slice(0, 8)}`)
                  const detailsHref = propertyId
                    ? `/properties/${propertyId}?tab=negociacoes&negotiationId=${negotiationId}${
                        proposalId ? `&proposalId=${proposalId}` : ''
                      }`
                    : null

                  const content = (
                    <>
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--foreground)]">{proposalTitle}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {propertyTitle} • {involvementLabel}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">{dateLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {proposalStatusLabel}
                        </p>
                        <p className="text-sm font-medium text-[var(--foreground)]">{valueLabel}</p>
                      </div>
                    </>
                  )

                  return detailsHref ? (
                    <Link
                      key={negotiationId}
                      href={detailsHref}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm hover:bg-[var(--accent)] transition-colors"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div
                      key={negotiationId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
                    >
                      {content}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Nenhum negocio com proposta encontrado para esta pessoa.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="relationships">
        <DataTable
          title="Vínculos"
          rows={links}
          emptyLabel="Nenhum vínculo encontrado para esta pessoa."
          error={errors.links}
        />
      </TabsContent>

      <TabsContent value="timeline">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nova nota</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateNote} className="space-y-3">
                <Input
                  label="Título"
                  placeholder="Ex: Ligação realizada"
                  value={noteTitle}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  disabled={isPending}
                />
                <Textarea
                  label="Descrição"
                  placeholder="Detalhe o que foi combinado..."
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  disabled={isPending}
                />
                {formError && <p className="text-sm text-[var(--destructive)]">{formError}</p>}
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar nota'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <DataTable
            title="Eventos"
            rows={timeline}
            emptyLabel="Nenhum evento encontrado para esta pessoa."
            error={errors.timeline}
          />
        </div>
      </TabsContent>

      <TabsContent value="documents">
        <PersonDocumentsClient personId={person.id} />
      </TabsContent>

      <TabsContent value="financial">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Dados do Proponente</CardTitle>
              <Button onClick={handleFinancingSave} disabled={financingSaving}>
                {financingSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Regime de bens"
                value={financingForm.property_regime}
                onChange={(event) =>
                  setFinancingForm((prev) => ({ ...prev, property_regime: event.target.value }))
                }
              />
              <Input
                label="Nacionalidade"
                value={financingForm.nationality}
                onChange={(event) =>
                  setFinancingForm((prev) => ({ ...prev, nationality: event.target.value }))
                }
              />
              <Input
                label="Profissão"
                value={financingForm.profession}
                onChange={(event) =>
                  setFinancingForm((prev) => ({ ...prev, profession: event.target.value }))
                }
              />
              <Input
                label="Escolaridade"
                value={financingForm.education_level}
                onChange={(event) =>
                  setFinancingForm((prev) => ({ ...prev, education_level: event.target.value }))
                }
              />
              <Input
                label="Nome da mãe"
                value={financingForm.mother_name}
                onChange={(event) =>
                  setFinancingForm((prev) => ({ ...prev, mother_name: event.target.value }))
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Endereço atual</CardTitle>
              <Button onClick={handleAddressSave} disabled={addressSaving}>
                {addressSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Rua"
                value={addressForm.street}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, street: event.target.value }))}
              />
              <Input
                label="Número"
                value={addressForm.number}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, number: event.target.value }))}
              />
              <Input
                label="Complemento"
                value={addressForm.complement}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, complement: event.target.value }))
                }
              />
              <Input
                label="Bairro"
                value={addressForm.neighborhood}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, neighborhood: event.target.value }))
                }
              />
              <Input
                label="Cidade"
                value={addressForm.city}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, city: event.target.value }))}
              />
              <Input
                label="UF"
                value={addressForm.state}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, state: event.target.value }))}
              />
              <Input
                label="CEP"
                value={addressForm.postal_code}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, postal_code: event.target.value }))
                }
              />
              <Input
                label="Reside desde"
                type="date"
                value={addressForm.residence_since}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, residence_since: event.target.value }))
                }
              />
              <Input
                label="Meses na residência"
                value={addressForm.residence_months}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, residence_months: event.target.value }))
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Renda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {incomeSources.length > 0 ? (
                <div className="space-y-3">
                  {incomeSources.map((income, index) => (
                    <div
                      key={(income.id as string) ?? `income-${index}`}
                      className="rounded-[var(--radius)] border border-[var(--border)] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {formatValue(income.income_type, 'income_type')}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {formatValue(income.employer_name, 'employer_name')}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => handleDeleteIncome(income.id as string)}
                          disabled={incomeSaving}
                        >
                          Remover
                        </Button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-[var(--muted-foreground)]">Renda bruta</p>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {formatValue(income.gross_monthly_income, 'gross_monthly_income')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--muted-foreground)]">Outras rendas</p>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {formatValue(income.other_monthly_income, 'other_monthly_income')}
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-xs text-[var(--muted-foreground)]">Notas</p>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {formatValue(income.notes, 'notes')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhuma renda cadastrada.</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label="Tipo de renda"
                  value={incomeForm.income_type}
                  onChange={(event) => setIncomeForm((prev) => ({ ...prev, income_type: event.target.value }))}
                />
                <Input
                  label="Empregador"
                  value={incomeForm.employer_name}
                  onChange={(event) =>
                    setIncomeForm((prev) => ({ ...prev, employer_name: event.target.value }))
                  }
                />
                <Input
                  label="CNPJ empregador"
                  value={incomeForm.employer_cnpj}
                  onChange={(event) =>
                    setIncomeForm((prev) => ({ ...prev, employer_cnpj: event.target.value }))
                  }
                />
                <Input
                  label="Renda bruta mensal"
                  value={incomeForm.gross_monthly_income}
                  onChange={(event) =>
                    setIncomeForm((prev) => ({ ...prev, gross_monthly_income: event.target.value }))
                  }
                />
                <Input
                  label="Outras rendas"
                  value={incomeForm.other_monthly_income}
                  onChange={(event) =>
                    setIncomeForm((prev) => ({ ...prev, other_monthly_income: event.target.value }))
                  }
                />
                <Input
                  label="Notas"
                  value={incomeForm.notes}
                  onChange={(event) => setIncomeForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
              <Button onClick={handleAddIncome} disabled={incomeSaving}>
                {incomeSaving ? 'Salvando...' : 'Adicionar renda'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comprometimentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {liabilities.length > 0 ? (
                <div className="space-y-3">
                  {liabilities.map((item, index) => (
                    <div
                      key={(item.id as string) ?? `liability-${index}`}
                      className="rounded-[var(--radius)] border border-[var(--border)] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {formatValue(item.kind, 'kind')}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {formatValue(item.creditor, 'creditor')}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => handleDeleteLiability(item.id as string)}
                          disabled={liabilitySaving}
                        >
                          Remover
                        </Button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-[var(--muted-foreground)]">Valor mensal</p>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {formatValue(item.monthly_amount, 'monthly_amount')}
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-xs text-[var(--muted-foreground)]">Notas</p>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {formatValue(item.notes, 'notes')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhum comprometimento cadastrado.</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label="Tipo"
                  value={liabilityForm.kind}
                  onChange={(event) => setLiabilityForm((prev) => ({ ...prev, kind: event.target.value }))}
                />
                <Input
                  label="Valor mensal"
                  value={liabilityForm.monthly_amount}
                  onChange={(event) =>
                    setLiabilityForm((prev) => ({ ...prev, monthly_amount: event.target.value }))
                  }
                />
                <Input
                  label="Credor"
                  value={liabilityForm.creditor}
                  onChange={(event) =>
                    setLiabilityForm((prev) => ({ ...prev, creditor: event.target.value }))
                  }
                />
                <Input
                  label="Notas"
                  value={liabilityForm.notes}
                  onChange={(event) => setLiabilityForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
              <Button onClick={handleAddLiability} disabled={liabilitySaving}>
                {liabilitySaving ? 'Salvando...' : 'Adicionar comprometimento'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conta bancária</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {bankAccounts.length > 0 ? (
                <div className="space-y-3">
                  {bankAccounts.map((account, index) => {
                    const isPreferred = Boolean(account.is_preferred)
                    return (
                      <div
                        key={(account.id as string) ?? `bank-${index}`}
                        className="rounded-[var(--radius)] border border-[var(--border)] p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-[var(--foreground)]">
                              {formatValue(account.bank_name, 'bank_name')}
                            </p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              Agência {formatValue(account.agency, 'agency')} · Conta{' '}
                              {formatValue(account.account_number, 'account_number')}
                            </p>
                          </div>
                          {isPreferred ? (
                            <Badge variant="secondary">Preferida</Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              onClick={() => handleSetPreferred(account.id as string)}
                              disabled={bankSaving}
                            >
                              Marcar preferida
                            </Button>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                          {formatValue(account.account_type, 'account_type')}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhuma conta cadastrada.</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label="Banco"
                  value={bankForm.bank_name}
                  onChange={(event) => setBankForm((prev) => ({ ...prev, bank_name: event.target.value }))}
                />
                <Input
                  label="Agência"
                  value={bankForm.agency}
                  onChange={(event) => setBankForm((prev) => ({ ...prev, agency: event.target.value }))}
                />
                <Input
                  label="Conta"
                  value={bankForm.account_number}
                  onChange={(event) =>
                    setBankForm((prev) => ({ ...prev, account_number: event.target.value }))
                  }
                />
                <Input
                  label="Tipo"
                  value={bankForm.account_type}
                  onChange={(event) =>
                    setBankForm((prev) => ({ ...prev, account_type: event.target.value }))
                  }
                />
                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={bankForm.is_preferred}
                    onChange={(event) =>
                      setBankForm((prev) => ({ ...prev, is_preferred: event.target.checked }))
                    }
                  />
                  Preferida
                </label>
              </div>
              <Button onClick={handleAddBankAccount} disabled={bankSaving}>
                {bankSaving ? 'Salvando...' : 'Adicionar conta'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Composição de renda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {householdMembers.length > 0 ? (
                <div className="space-y-3">
                  {householdMembers.map((member, index) => (
                    <div
                      key={(member.id as string) ?? `member-${index}`}
                      className="rounded-[var(--radius)] border border-[var(--border)] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {member.member?.full_name ||
                              member.member?.email ||
                              formatValue(member.member_person_id, 'member_person_id') ||
                              'Membro'}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {member.member?.email || member.member?.phone_e164 || '—'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => handleRemoveHouseholdMember(member.id as string)}
                          disabled={householdSaving}
                        >
                          Remover
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                        Relação: {formatValue(member.relationship, 'relationship')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhum membro cadastrado.</p>
              )}

              <form onSubmit={handleSearchHousehold} className="space-y-3">
                <Input
                  label="Buscar pessoa"
                  placeholder="Nome, email ou telefone"
                  value={householdQuery}
                  onChange={(event) => setHouseholdQuery(event.target.value)}
                />
                <Input
                  label="Relação"
                  placeholder="Ex: Cônjuge, Filho"
                  value={relationshipInput}
                  onChange={(event) => setRelationshipInput(event.target.value)}
                />
                <Button type="submit" variant="outline" disabled={householdSaving}>
                  {householdSaving ? 'Buscando...' : 'Buscar'}
                </Button>
              </form>

              {householdResults.length > 0 && (
                <div className="space-y-2">
                  {householdResults.map((result, index) => {
                    const line1 =
                      asText(result.full_name) ||
                      asText(result.email) ||
                      asText(result.phone_e164) ||
                      asText(result.id) ||
                      `result-${index}`

                    const line2 = asText(result.email) || asText(result.phone_e164) || '—'

                    return (
                      <div
                        key={(result.id as string) ?? `result-${index}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-[var(--foreground)]">{line1}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{line2}</p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => handleAddHouseholdMember(result.id as string)}
                          disabled={householdSaving}
                        >
                          Vincular
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados do Banco (financiamento)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-[var(--foreground)]">
                  Ver perfil de financiamento
                </summary>
                <div className="mt-4">
                  <KeyValueList data={(financingProfile as Record<string, unknown>) || {}} />
                </div>
              </details>

              <FullDataTable title="Endereços" rows={addresses as AnyRow[]} emptyLabel="Nenhum endereço cadastrado." />
              <FullDataTable title="Rendas" rows={incomeSources as AnyRow[]} emptyLabel="Nenhuma renda cadastrada." />
              <FullDataTable
                title="Comprometimentos"
                rows={liabilities as AnyRow[]}
                emptyLabel="Nenhum comprometimento cadastrado."
              />
              <FullDataTable
                title="Contas bancárias"
                rows={bankAccounts as AnyRow[]}
                emptyLabel="Nenhuma conta cadastrada."
              />
              <FullDataTable
                title="Composição de renda"
                rows={householdMembers as AnyRow[]}
                emptyLabel="Nenhum membro cadastrado."
              />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="settings">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted-foreground)]">Configurações em breve.</p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}


