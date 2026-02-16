'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  updatePropertyDealStatus,
  createPropertyNegotiation,
  getPropertyNegotiations,
  searchPeople,
  getProposalBundleByNegotiation,
  saveProposalDraftBundle,
  transitionProposalStatus,
  type PersonSearchRow,
} from '../actions'

type PropertyRow = {
  id: string
  owner_user_id: string | null
  title: string | null
  purpose: string | null
  status: string | null
  created_at: string | null
  price: number | null
  rent_price: number | null
  commission_percent?: number | null
  property_category_id: string | null
  property_commission_settings?:
    | {
        sale_commission_percent?: number | null
        sale_broker_split_percent?: number | null
        sale_partner_split_percent?: number | null
        rent_initial_commission_percent?: number | null
        rent_recurring_commission_percent?: number | null
        rent_broker_split_percent?: number | null
        rent_partner_split_percent?: number | null
      }
    | {
        sale_commission_percent?: number | null
        sale_broker_split_percent?: number | null
        sale_partner_split_percent?: number | null
        rent_initial_commission_percent?: number | null
        rent_recurring_commission_percent?: number | null
        rent_broker_split_percent?: number | null
        rent_partner_split_percent?: number | null
      }[]
    | null
  property_categories?: { name: string | null } | { name: string | null }[] | null
  deal_status: 'reserved' | 'sold' | null
  deal_marked_at: string | null
  deal_visible_until: string | null
}

type PaymentKey = 'cash' | 'installments' | 'financing' | 'consortium' | 'trade' | 'other'

const PAYMENT_LABELS: Record<PaymentKey, string> = {
  cash: 'A vista',
  installments: 'Parcelado direto',
  financing: 'Financiamento',
  consortium: 'Consorcio',
  trade: 'Permuta',
  other: 'Outro',
}

type DraftProposal = {
  enabled: Partial<Record<PaymentKey, boolean>>
  amounts: Partial<Record<PaymentKey, number>>
  notes?: string
  installments?: Array<{
    installment_no: number
    amount: number
    due_date: string
    note?: string | null
  }>
}

type ProposalEntity = {
  negotiation_id: string
  person_id: string
  title: string
  created_at?: string | null
  status?: string | null
  value_estimate?: number | null
  name?: string | null
  email?: string | null
  phone_e164?: string | null
}

type ProposalDbRow = {
  id: string
  status: string | null
  title: string | null
  description: string | null
  commission_percent: number | null
  commission_value: number | null
  base_value?: number | null
  owner_net_value?: number | null
  broker_split_percent?: number | null
  broker_commission_value?: number | null
  partner_split_percent?: number | null
  partner_commission_value?: number | null
  company_commission_value?: number | null
  commission_modality?: string | null
  created_by_profile_id: string | null
  broker_seller_profile_id: string | null
  broker_buyer_profile_id: string | null
}

type ProposalPaymentDbRow = {
  id: string
  method: string
  amount: number
  due_date: string | null
  details: string | null
}

type ProposalInstallmentDbRow = {
  id: string
  proposal_payment_id: string
  installment_no: number
  amount: number
  due_date: string
  note: string | null
}

type ProposalFeedback = {
  kind: 'success' | 'error'
  message: string
}

type NegotiationRow = {
  id: string
  property_id: string
  person_id: string | null
  status: string | null
  created_at: string | null
  person_is_restricted: boolean
  proposal: {
    id: string
    status: string | null
    title: string | null
    description: string | null
    broker_seller_profile_id: string | null
    broker_buyer_profile_id: string | null
    sent_at: string | null
    updated_at: string | null
    created_at: string | null
    total_value: number | null
    counterparty_broker: {
      id: string
      full_name: string | null
      email: string | null
    } | null
  } | null
  person: {
    id: string
    full_name: string | null
    email: string | null
    phone_e164: string | null
  } | null
  lead_id?: string | null
  updated_at?: string | null
}

type Props = {
  propertyId: string
  initialNegotiationId?: string | null
  initialProposalId?: string | null
}

const draftKey = (propertyId: string, personId: string) => `vitrya:proposal:${propertyId}:${personId}`
const readProposalStorageKey = (userId: string) => `vitrya:proposal-read:${userId}`

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR')
}

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const getDaysSince = (value?: string | null) => {
  if (!value) return null
  const start = new Date(value)
  if (Number.isNaN(start.getTime())) return null
  const diff = Date.now() - start.getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addMonthsToDateInput(seed: string, months: number): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(seed) ? new Date(`${seed}T00:00:00`) : new Date()
  const next = new Date(base)
  next.setMonth(next.getMonth() + months)
  return toDateInputValue(next)
}

function buildInstallmentPlan(total: number, count: number, firstDueDate: string) {
  const safeTotal = Number.isFinite(total) ? Math.max(total, 0) : 0
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1))
  const centsTotal = Math.round(safeTotal * 100)
  const centsBase = Math.floor(centsTotal / safeCount)
  const remainder = centsTotal - centsBase * safeCount

  return Array.from({ length: safeCount }, (_, index) => {
    const cents = centsBase + (index === safeCount - 1 ? remainder : 0)
    return {
      installment_no: index + 1,
      amount: cents / 100,
      due_date: addMonthsToDateInput(firstDueDate, index),
      note: null as string | null,
    }
  })
}

function getProposalStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'in_review':
      return 'Em analise'
    case 'counterproposal':
      return 'Contraproposta'
    case 'approved':
      return 'Aprovado'
    case 'rejected':
      return 'Rejeitado'
    case 'draft':
    default:
      return 'Rascunho'
  }
}

function getProposalStatusTone(status: string | null | undefined): string {
  switch (status) {
    case 'in_review':
      return 'border-amber-300 bg-amber-500 text-white'
    case 'counterproposal':
      return 'border-sky-300 bg-sky-500 text-white'
    case 'approved':
      return 'border-emerald-300 bg-emerald-500 text-white'
    case 'rejected':
      return 'border-rose-300 bg-rose-500 text-white'
    case 'draft':
    default:
      return 'border-zinc-300 bg-zinc-600 text-white'
  }
}

type ProposalKanbanKey = 'sem_proposta' | 'draft' | 'in_review' | 'counterproposal' | 'approved' | 'rejected'

const PROPOSAL_KANBAN_COLUMNS: Array<{
  key: ProposalKanbanKey
  label: string
  tone: string
  collapsible?: boolean
}> = [
  { key: 'in_review', label: 'Em analise', tone: 'border-amber-300 bg-amber-500 text-white' },
  { key: 'counterproposal', label: 'Contraproposta', tone: 'border-sky-300 bg-sky-500 text-white' },
  { key: 'approved', label: 'Aprovado', tone: 'border-emerald-300 bg-emerald-500 text-white' },
  { key: 'rejected', label: 'Rejeitado', tone: 'border-rose-300 bg-rose-500 text-white', collapsible: true },
  { key: 'sem_proposta', label: 'Sem proposta', tone: 'border-zinc-200 bg-zinc-100 text-zinc-700', collapsible: true },
  { key: 'draft', label: 'Rascunho', tone: 'border-zinc-300 bg-zinc-600 text-white', collapsible: true },
]

function getProposalKanbanKey(row: NegotiationRow): ProposalKanbanKey {
  if (!row.proposal) return 'sem_proposta'
  const status = String(row.proposal.status ?? 'draft')
  if (status === 'in_review') return 'in_review'
  if (status === 'counterproposal') return 'counterproposal'
  if (status === 'approved') return 'approved'
  if (status === 'rejected') return 'rejected'
  return 'draft'
}

function getProposalEventKey(row: NegotiationRow): string | null {
  if (!row.proposal?.id) return null
  const stamp = row.proposal.sent_at ?? row.proposal.updated_at ?? row.proposal.created_at
  if (!stamp) return null
  return `${row.proposal.id}:${stamp}`
}

function isEmpreendimentoByCategoryName(name?: string | null) {
  if (!name) return false
  const n = name.toLowerCase()
  return (
    n.includes('empreendimento') ||
    n.includes('incorpora') ||
    n.includes('lancamento') ||
    n.includes('lancamento')
  )
}

export default function PropertyNegotiationsTabClient({
  propertyId,
  initialNegotiationId,
  initialProposalId,
}: Props) {
  const [property, setProperty] = useState<PropertyRow | null>(null)
  const [negotiations, setNegotiations] = useState<NegotiationRow[]>([])
  const [loading, setLoading] = useState(true)

  const [savingDeal, setSavingDeal] = useState(false)
  const [creatingNegotiation, setCreatingNegotiation] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // comissao (UI)
  const [commissionPercent, setCommissionPercent] = useState<number>(5)

  // auth/profile (permissoes UI)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  const canEditDeal = useMemo(() => {
    if (!property) return false
    if (!userId) return false
    const isOwner = property.owner_user_id === userId
    const isAdmin = userRole === 'admin'
    const isGestor = userRole === 'gestor'
    return !!(isOwner || isAdmin || isGestor)
  }, [property, userId, userRole])

  // Modal proposta
  const [proposalOpen, setProposalOpen] = useState(false)
  const [proposalEntity, setProposalEntity] = useState<ProposalEntity | null>(null)
  const [proposalId, setProposalId] = useState<string | null>(null)
  const [proposalStatus, setProposalStatus] = useState<string>('draft')
  const [proposalCreatedByProfileId, setProposalCreatedByProfileId] = useState<string | null>(null)
  const [proposalSellerBrokerId, setProposalSellerBrokerId] = useState<string | null>(null)
  const [proposalBuyerBrokerId, setProposalBuyerBrokerId] = useState<string | null>(null)
  const [proposalLoading, setProposalLoading] = useState(false)
  const [proposalSubmitting, setProposalSubmitting] = useState(false)
  const [proposalAction, setProposalAction] = useState<
    'save' | 'submit_review' | 'submit_counterproposal' | 'back_to_draft' | 'approve' | 'reject' | null
  >(null)
  const [proposalFeedback, setProposalFeedback] = useState<ProposalFeedback | null>(null)
  const [proposalDraft, setProposalDraft] = useState<DraftProposal>({
    enabled: { cash: true },
    amounts: { cash: 0 },
    notes: '',
    installments: [],
  })
  const [installmentCount, setInstallmentCount] = useState<number>(3)
  const [installmentFirstDueDate, setInstallmentFirstDueDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return toDateInputValue(d)
  })
  const autoOpenedFromNotificationRef = useRef<string | null>(null)

  // Modal criar negociacao
  const [newOpen, setNewOpen] = useState(false)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [peopleResults, setPeopleResults] = useState<PersonSearchRow[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<PersonSearchRow | null>(null)
  const [readProposalEvents, setReadProposalEvents] = useState<string[]>([])

  const categoryName = useMemo(() => {
    const rel = property?.property_categories as any
    if (!rel) return null
    if (Array.isArray(rel)) return rel?.[0]?.name ?? null
    return rel?.name ?? null
  }, [property?.property_categories])

  const isEmpreendimento = useMemo(() => isEmpreendimentoByCategoryName(categoryName ?? null), [categoryName])

  const propertyValue = useMemo(() => {
    if (!property) return null
    if (property.purpose?.toLowerCase().includes('rent')) return property.rent_price ?? null
    if (property.purpose?.toLowerCase().includes('loca')) return property.rent_price ?? null
    return property.price ?? null
  }, [property])

  const commissionSettings = useMemo(() => {
    const raw = property?.property_commission_settings as any
    if (!raw) return null
    if (Array.isArray(raw)) return raw[0] ?? null
    return raw
  }, [property?.property_commission_settings])

  const defaultCommissionPercent = useMemo(() => {
    const isRent =
      property?.purpose?.toLowerCase().includes('rent') || property?.purpose?.toLowerCase().includes('loca')
    if (isRent) {
      return Number(commissionSettings?.rent_initial_commission_percent ?? 10)
    }
    return Number(commissionSettings?.sale_commission_percent ?? property?.commission_percent ?? 5)
  }, [property?.purpose, property?.commission_percent, commissionSettings])

  const brokerSplitPercent = useMemo(() => {
    const isRent =
      property?.purpose?.toLowerCase().includes('rent') || property?.purpose?.toLowerCase().includes('loca')
    return Number(
      isRent
        ? commissionSettings?.rent_broker_split_percent ?? 50
        : commissionSettings?.sale_broker_split_percent ?? 50
    )
  }, [property?.purpose, commissionSettings])

  const partnerSplitPercent = useMemo(() => {
    const isRent =
      property?.purpose?.toLowerCase().includes('rent') || property?.purpose?.toLowerCase().includes('loca')
    return Number(
      isRent
        ? commissionSettings?.rent_partner_split_percent ?? 0
        : commissionSettings?.sale_partner_split_percent ?? 0
    )
  }, [property?.purpose, commissionSettings])

  const dealBadge = useMemo(() => {
    if (!property) return null
    if (property.deal_status === 'reserved') return { label: 'Reservado', tone: 'bg-amber-500 text-white' }
    if (property.deal_status === 'sold') return { label: 'Vendido', tone: 'bg-emerald-600 text-white' }
    return { label: 'Disponivel', tone: 'bg-sky-500 text-white' }
  }, [property])

  const proposalTotals = useMemo(() => {
    const enabled = proposalDraft.enabled || {}
    const amounts = proposalDraft.amounts || {}
    let total = 0

    ;(Object.keys(PAYMENT_LABELS) as PaymentKey[]).forEach((k) => {
      if (!enabled[k]) return
      const v = Number(amounts[k] ?? 0)
      if (!Number.isFinite(v)) return
      total += v
    })

    const target = Number(propertyValue ?? 0)
    const diff = target - total
    return { total, target: propertyValue ?? null, diff }
  }, [proposalDraft, propertyValue])

  const installmentsRows = useMemo(() => proposalDraft.installments ?? [], [proposalDraft.installments])
  const installmentsEnabled = !!proposalDraft.enabled?.installments
  const installmentsAmount = Number(proposalDraft.amounts?.installments ?? 0)
  const installmentsTotal = useMemo(
    () =>
      installmentsRows.reduce((acc, row) => {
        const value = Number(row.amount ?? 0)
        return acc + (Number.isFinite(value) ? value : 0)
      }, 0),
    [installmentsRows]
  )
  const installmentsRequireDetails = installmentsEnabled && installmentsAmount > 0
  const hasInstallmentsRows = installmentsRows.length > 0
  const hasInstallmentsInvalidRow = useMemo(
    () =>
      installmentsRows.some((row) => {
        const amount = Number(row.amount ?? 0)
        return !row.due_date || !Number.isFinite(amount) || amount <= 0
      }),
    [installmentsRows]
  )
  const installmentsSummaryMismatch =
    installmentsRequireDetails && hasInstallmentsRows && Math.abs(installmentsTotal - installmentsAmount) > 0.01

  const commissionBaseValue = useMemo(() => {
    const fromProposal = Number(proposalTotals.total ?? 0)
    if (Number.isFinite(fromProposal) && fromProposal > 0) return fromProposal
    const fromProperty = Number(propertyValue ?? 0)
    if (Number.isFinite(fromProperty) && fromProperty > 0) return fromProperty
    return 0
  }, [proposalTotals.total, propertyValue])

  const commissionValue = useMemo(() => {
    const percent = Number(commissionPercent ?? 0)
    if (!Number.isFinite(percent) || percent <= 0) return 0
    return (commissionBaseValue * percent) / 100
  }, [commissionBaseValue, commissionPercent])

  const ownerNetValue = useMemo(() => commissionBaseValue - commissionValue, [commissionBaseValue, commissionValue])
  const brokerCommissionValue = useMemo(
    () => (commissionValue * (Number.isFinite(brokerSplitPercent) ? brokerSplitPercent : 0)) / 100,
    [commissionValue, brokerSplitPercent]
  )
  const partnerCommissionValue = useMemo(
    () => (commissionValue * (Number.isFinite(partnerSplitPercent) ? partnerSplitPercent : 0)) / 100,
    [commissionValue, partnerSplitPercent]
  )
  const companyCommissionValue = useMemo(
    () => commissionValue - brokerCommissionValue - partnerCommissionValue,
    [commissionValue, brokerCommissionValue, partnerCommissionValue]
  )

  const isProposalDraftEditable = proposalStatus === 'draft'
  const isManager = userRole === 'admin' || userRole === 'gestor'
  const isProposalCreator = !!userId && proposalCreatedByProfileId === userId
  const isPropertyOwner = !!userId && property?.owner_user_id === userId
  const canManageProposal = isManager || isProposalCreator || isPropertyOwner
  const canBackToDraft = canManageProposal
  const isSellerDecision = proposalStatus === 'in_review'
  const isBuyerDecision = proposalStatus === 'counterproposal'
  const isSellerBrokerActor = !!userId && !!proposalSellerBrokerId && proposalSellerBrokerId === userId
  const isBuyerBrokerActor = !!userId && !!proposalBuyerBrokerId && proposalBuyerBrokerId === userId
  const canApproveOrReject =
    isManager || (isSellerDecision && isSellerBrokerActor) || (isBuyerDecision && isBuyerBrokerActor)
  const canShowApproveReject = canApproveOrReject && (isSellerDecision || isBuyerDecision)
  const proposalRoleChips = useMemo(() => {
    const chips: string[] = []
    if (isManager) chips.push('Gestor/Admin')
    if (isProposalCreator) chips.push('Criador da proposta')
    if (isPropertyOwner) chips.push('Responsável do imóvel')
    if (isSellerBrokerActor) chips.push('Lado vendedor')
    if (isBuyerBrokerActor) chips.push('Lado comprador')
    return chips
  }, [isManager, isProposalCreator, isPropertyOwner, isSellerBrokerActor, isBuyerBrokerActor])

  const hasEnabledPaymentMethod = useMemo(
    () => (Object.keys(PAYMENT_LABELS) as PaymentKey[]).some((k) => !!proposalDraft.enabled?.[k]),
    [proposalDraft]
  )

  const isCommissionPercentValid = Number.isFinite(commissionPercent) && commissionPercent >= 0 && commissionPercent <= 100
  const splitPercentTotal = (Number.isFinite(brokerSplitPercent) ? brokerSplitPercent : 0) + (Number.isFinite(partnerSplitPercent) ? partnerSplitPercent : 0)
  const isSplitPercentValid = splitPercentTotal <= 100
  const areInstallmentsValid = !installmentsRequireDetails || (hasInstallmentsRows && !hasInstallmentsInvalidRow)

  const canSubmitProposal =
    isProposalDraftEditable &&
    canManageProposal &&
    hasEnabledPaymentMethod &&
    proposalTotals.total > 0 &&
    isCommissionPercentValid &&
    isSplitPercentValid &&
    areInstallmentsValid

  const proposalDiffSummary = useMemo(() => {
    if (proposalTotals.target === null) return 'Sem valor de referencia do imóvel.'
    if (proposalTotals.diff === 0) return 'Valor da proposta alinhado com o imóvel.'
    if (proposalTotals.diff > 0) return `Faltam ${formatCurrency(proposalTotals.diff)} para chegar no valor do imóvel.`
    return `Proposta acima em ${formatCurrency(Math.abs(proposalTotals.diff))}.`
  }, [proposalTotals])

  const propertyPublicationDays = useMemo(() => getDaysSince(property?.created_at), [property?.created_at])
  const propertyPublicationLabel = useMemo(() => {
    if (property?.status !== 'active') return 'Nao publicado'
    if (propertyPublicationDays === null) return 'Tempo sem data'
    return `Tempo ${propertyPublicationDays} dia${propertyPublicationDays === 1 ? '' : 's'}`
  }, [property?.status, propertyPublicationDays])
  const propertyPublicationTone = useMemo(
    () =>
      property?.status === 'active'
        ? 'border-cyan-300 bg-cyan-500 text-white'
        : 'border-zinc-300 bg-zinc-200 text-zinc-700',
    [property?.status]
  )

  const kanbanColumns = useMemo(() => {
    const grouped: Record<ProposalKanbanKey, NegotiationRow[]> = {
      sem_proposta: [],
      draft: [],
      in_review: [],
      counterproposal: [],
      approved: [],
      rejected: [],
    }

    for (const row of negotiations) {
      grouped[getProposalKanbanKey(row)].push(row)
    }

    return PROPOSAL_KANBAN_COLUMNS.map((column) => ({
      ...column,
      rows: grouped[column.key],
    }))
  }, [negotiations])

  async function loadAll() {
    setLoading(true)
    setError(null)

    try {
      // auth + role
      const { data: userRes } = await supabase.auth.getUser()
      const uid = userRes?.user?.id ?? null
      setUserId(uid)

      if (uid) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
        setUserRole((profile as any)?.role ?? null)
      } else {
        setUserRole(null)
      }

      // property
      const { data: prop, error: propErr } = await supabase
        .from('properties')
        .select(
          `
          id,
          owner_user_id,
          title,
          purpose,
          status,
          created_at,
          price,
          rent_price,
          commission_percent,
          property_category_id,
          deal_status,
          deal_marked_at,
          deal_visible_until,
          property_categories ( name ),
          property_commission_settings (
            sale_commission_percent,
            sale_broker_split_percent,
            sale_partner_split_percent,
            rent_initial_commission_percent,
            rent_recurring_commission_percent,
            rent_broker_split_percent,
            rent_partner_split_percent
          )
        `
        )
        .eq('id', propertyId)
        .maybeSingle()

      if (propErr) throw propErr
      setProperty((prop as any) ?? null)

      // agora lista pela tabela certa
      const negs = await getPropertyNegotiations(propertyId)
      setNegotiations(negs ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar negociações.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!userId || typeof window === 'undefined') {
      setReadProposalEvents([])
      return
    }

    try {
      const raw = window.localStorage.getItem(readProposalStorageKey(userId))
      if (!raw) {
        setReadProposalEvents([])
        return
      }
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        setReadProposalEvents([])
        return
      }
      setReadProposalEvents(parsed.filter((item) => typeof item === 'string'))
    } catch {
      setReadProposalEvents([])
    }
  }, [userId])

  const markProposalEventAsRead = useCallback(
    (eventKey: string | null) => {
      if (!eventKey || !userId || typeof window === 'undefined') return
      setReadProposalEvents((prev) => {
        if (prev.includes(eventKey)) return prev
        const next = [eventKey, ...prev].slice(0, 500)
        try {
          window.localStorage.setItem(readProposalStorageKey(userId), JSON.stringify(next))
        } catch {
          // ignore quota errors
        }
        return next
      })
    },
    [userId]
  )

  async function openProposalAndMarkAsRead(n: NegotiationRow) {
    markProposalEventAsRead(getProposalEventKey(n))
    await openProposalFromNegotiation(n)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId])

  useEffect(() => {
    if (!initialNegotiationId) return
    if (loading) return

    const marker = `${propertyId}:${initialNegotiationId}:${initialProposalId ?? ''}`
    if (autoOpenedFromNotificationRef.current === marker) return

    const negotiationToOpen = negotiations.find((item) => item.id === initialNegotiationId)
    if (!negotiationToOpen) return

    autoOpenedFromNotificationRef.current = marker
    void openProposalAndMarkAsRead(negotiationToOpen)

    if (typeof window !== 'undefined') {
      const nextParams = new URLSearchParams(window.location.search)
      nextParams.delete('negotiationId')
      nextParams.delete('proposalId')
      const query = nextParams.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNegotiationId, initialProposalId, loading, negotiations, propertyId])

  useEffect(() => {
    if (!newOpen) {
      setPeopleQuery('')
      setPeopleResults([])
      setPeopleLoading(false)
      setSelectedPerson(null)
    }
  }, [newOpen])

  useEffect(() => {
    if (!proposalFeedback) return
    const timer = window.setTimeout(() => {
      setProposalFeedback(null)
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [proposalFeedback])

  useEffect(() => {
    if (!newOpen) return
    const term = peopleQuery.trim()
    if (!term) {
      setPeopleResults([])
      setPeopleLoading(false)
      return
    }

    const handle = window.setTimeout(async () => {
      setPeopleLoading(true)
      const res = await searchPeople(term)
      if (res.ok) {
        setPeopleResults((res.data ?? []).slice(0, 10))
      } else {
        setPeopleResults([])
        setError(res.error || 'Erro ao buscar pessoas.')
      }
      setPeopleLoading(false)
    }, 250)

    return () => window.clearTimeout(handle)
  }, [peopleQuery, newOpen])

  async function setDealStatus(next: 'reserved' | 'sold' | null) {
    if (!property) return
    setSavingDeal(true)
    setError(null)

    try {
      const res = await updatePropertyDealStatus(property.id, next)
      if (!res.success) throw new Error(res.error || 'Falha ao atualizar status comercial.')
      await loadAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível atualizar o status comercial.'
      setError(message)
    } finally {
      setSavingDeal(false)
    }
  }

  function saveProposalDraftLocal(personId: string, draft: DraftProposal) {
    try {
      localStorage.setItem(draftKey(propertyId, personId), JSON.stringify(draft))
    } catch {
      // ignore
    }
  }

  function getDraftFromLocal(personId: string): DraftProposal {
    try {
      const raw = localStorage.getItem(draftKey(propertyId, personId))
      if (!raw) {
        return { enabled: { cash: true }, amounts: { cash: 0 }, notes: '', installments: [] }
      }
      const parsed = JSON.parse(raw) as DraftProposal
      return {
        enabled: parsed.enabled || { cash: true },
        amounts: parsed.amounts || { cash: 0 },
        notes: parsed.notes || '',
        installments: parsed.installments || [],
      }
    } catch {
      return { enabled: { cash: true }, amounts: { cash: 0 }, notes: '', installments: [] }
    }
  }

  function draftFromPayments(
    payments: ProposalPaymentDbRow[],
    installments: ProposalInstallmentDbRow[],
    notes?: string | null
  ): DraftProposal {
    const enabled: Partial<Record<PaymentKey, boolean>> = {}
    const amounts: Partial<Record<PaymentKey, number>> = {}

    for (const payment of payments ?? []) {
      const method = String(payment.method || '') as PaymentKey
      if (!(method in PAYMENT_LABELS)) continue
      enabled[method] = true
      amounts[method] = Number(payment.amount ?? 0)
    }

    return {
      enabled: Object.keys(enabled).length ? enabled : { cash: true },
      amounts: Object.keys(amounts).length ? amounts : { cash: 0 },
      notes: notes ?? '',
      installments: (installments ?? []).map((item) => ({
        installment_no: Number(item.installment_no ?? 1),
        amount: Number(item.amount ?? 0),
        due_date: item.due_date,
        note: item.note ?? null,
      })),
    }
  }

  async function openProposalFromNegotiation(n: NegotiationRow) {
    const personId = n.person_id
    if (!personId) {
      setError('Negociacao sem Pessoa vinculada. Corrija a vinculacao antes da proposta.')
      return
    }

    const personTitle = n.person_is_restricted
      ? 'Cliente oculto'
      : n.person?.full_name || n.person?.email || n.person?.phone_e164 || `Pessoa ${personId.slice(0, 6)}`

    const entity: ProposalEntity = {
      negotiation_id: n.id,
      person_id: personId,
      title: personTitle,
      created_at: n.created_at ?? null,
      status: n.status ?? 'proposta',
      value_estimate: null,
      name: n.person_is_restricted ? null : n.person?.full_name ?? null,
      email: n.person_is_restricted ? null : n.person?.email ?? null,
      phone_e164: n.person_is_restricted ? null : n.person?.phone_e164 ?? null,
    }

    setProposalEntity(entity)
    setProposalOpen(true)
    setProposalLoading(true)
    setProposalId(null)
    setProposalStatus('draft')
    setProposalCreatedByProfileId(userId ?? null)
    setProposalSellerBrokerId(null)
    setProposalBuyerBrokerId(null)
    setProposalFeedback(null)
    setError(null)

    const localDraft = getDraftFromLocal(personId)
    setProposalDraft(localDraft)

    setCommissionPercent(Number.isFinite(defaultCommissionPercent) ? defaultCommissionPercent : 5)

    try {
      const bundle = await getProposalBundleByNegotiation(entity.negotiation_id)
      const proposal = (bundle?.proposal ?? null) as ProposalDbRow | null
      const latestVersion = bundle?.latestVersion as any

      if (proposal) {
        setProposalId(proposal.id)
        setProposalStatus(proposal.status || 'draft')
        setProposalCreatedByProfileId(proposal.created_by_profile_id ?? null)
        setProposalSellerBrokerId(proposal.broker_seller_profile_id ?? null)
        setProposalBuyerBrokerId(proposal.broker_buyer_profile_id ?? null)
        setCommissionPercent(
          Number.isFinite(Number(proposal.commission_percent))
            ? Number(proposal.commission_percent)
            : Number.isFinite(defaultCommissionPercent)
            ? defaultCommissionPercent
            : 5
        )
      }

      let nextDraft = localDraft
      if (latestVersion?.snapshot) {
        const snapshot = latestVersion.snapshot as any
        nextDraft = draftFromPayments(
          (snapshot?.payments ?? []) as ProposalPaymentDbRow[],
          (snapshot?.installments ?? []) as ProposalInstallmentDbRow[],
          (snapshot?.note as string | undefined) ?? (snapshot?.proposal?.description as string | undefined) ?? ''
        )
      } else if (proposal && bundle?.payments?.length) {
        nextDraft = draftFromPayments(
          bundle.payments as ProposalPaymentDbRow[],
          (bundle.installments ?? []) as ProposalInstallmentDbRow[],
          proposal.description ?? ''
        )
      }

      setProposalDraft(nextDraft)
      const nextInstallments = nextDraft.installments ?? []
      setInstallmentCount(nextInstallments.length > 0 ? nextInstallments.length : 3)
      if (nextInstallments.length > 0 && nextInstallments[0]?.due_date) {
        setInstallmentFirstDueDate(nextInstallments[0].due_date)
      }
      saveProposalDraftLocal(personId, nextDraft)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar proposta.'
      setError(message)
    } finally {
      setProposalLoading(false)
    }
  }

  function buildProposalPayload() {
    const installments =
      proposalDraft.enabled?.installments && (proposalDraft.installments?.length ?? 0) > 0
        ? (proposalDraft.installments ?? []).map((item) => ({
            method: 'installments',
            installment_no: Number(item.installment_no ?? 1),
            amount: Number(item.amount ?? 0),
            due_date: item.due_date,
            note: item.note ?? null,
          }))
        : []

    const installmentsPayloadTotal = installments.reduce((acc, item) => {
      const amount = Number(item.amount ?? 0)
      return acc + (Number.isFinite(amount) ? amount : 0)
    }, 0)

    const payments = (Object.keys(PAYMENT_LABELS) as PaymentKey[])
      .filter((k) => !!proposalDraft.enabled?.[k])
      .map((k) => {
        const rawAmount =
          k === 'installments' && installments.length > 0
            ? installmentsPayloadTotal
            : Number(proposalDraft.amounts?.[k] ?? 0)

        return {
          method: k,
          amount: Number.isFinite(rawAmount) ? rawAmount : 0,
          due_date: null as string | null,
          details: null as string | null,
        }
      })

    return {
      negotiationId: proposalEntity?.negotiation_id || '',
      title: proposalEntity?.title || 'Proposta',
      description: proposalDraft.notes || '',
      commission_percent: Number.isFinite(commissionPercent) ? commissionPercent : null,
      commission_value: Number.isFinite(commissionValue) ? commissionValue : null,
      base_value: Number.isFinite(commissionBaseValue) ? commissionBaseValue : null,
      owner_net_value: Number.isFinite(ownerNetValue) ? ownerNetValue : null,
      broker_split_percent: Number.isFinite(brokerSplitPercent) ? brokerSplitPercent : null,
      broker_commission_value: Number.isFinite(brokerCommissionValue) ? brokerCommissionValue : null,
      partner_split_percent: Number.isFinite(partnerSplitPercent) ? partnerSplitPercent : null,
      partner_commission_value: Number.isFinite(partnerCommissionValue) ? partnerCommissionValue : null,
      company_commission_value: Number.isFinite(companyCommissionValue) ? companyCommissionValue : null,
      commission_modality:
        property?.purpose?.toLowerCase().includes('rent') || property?.purpose?.toLowerCase().includes('loca')
          ? 'rent_initial'
          : 'sale',
      payments,
      installments,
    }
  }

  function applyInstallmentsDraft(nextInstallments: DraftProposal['installments']) {
    if (!proposalEntity) return

    const normalized = (nextInstallments ?? []).map((row, index) => ({
      installment_no: index + 1,
      amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0,
      due_date: row.due_date || '',
      note: row.note ?? null,
    }))
    const total = normalized.reduce((acc, row) => acc + Number(row.amount ?? 0), 0)

    const next = {
      ...proposalDraft,
      installments: normalized,
      amounts: {
        ...(proposalDraft.amounts || {}),
        installments: total,
      },
    }

    setProposalDraft(next)
    saveProposalDraftLocal(proposalEntity.person_id, next)
  }

  async function handleSaveProposalDraft() {
    if (!proposalEntity) return
    setProposalSubmitting(true)
    setProposalAction('save')
    setProposalFeedback(null)
    setError(null)
    try {
      const payload = buildProposalPayload()
      const res = await saveProposalDraftBundle(payload)
      if (!res.success) throw new Error(res.error || 'Erro ao salvar rascunho.')
      setProposalId(res.proposalId)
      setProposalStatus('draft')
      setProposalSellerBrokerId((prev) => prev ?? property?.owner_user_id ?? null)
      setProposalBuyerBrokerId((prev) => prev ?? userId ?? null)
      saveProposalDraftLocal(proposalEntity.person_id, proposalDraft)
      setProposalFeedback({ kind: 'success', message: 'Rascunho salvo com sucesso.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar rascunho.'
      setProposalFeedback({ kind: 'error', message })
      setError(message)
    } finally {
      setProposalSubmitting(false)
      setProposalAction(null)
    }
  }

  async function handleTransitionProposal(
    action: 'submit_review' | 'submit_counterproposal' | 'back_to_draft' | 'approve' | 'reject'
  ) {
    if (!proposalEntity) return
    setProposalSubmitting(true)
    setProposalAction(action)
    setProposalFeedback(null)
    setError(null)
    try {
      let nextProposalId = proposalId
      if (!nextProposalId) {
        const saveRes = await saveProposalDraftBundle(buildProposalPayload())
        if (!saveRes.success) throw new Error(saveRes.error || 'Erro ao salvar rascunho antes da transicao.')
        nextProposalId = saveRes.proposalId
      } else if (proposalStatus === 'draft' && action !== 'back_to_draft') {
        const saveRes = await saveProposalDraftBundle(buildProposalPayload())
        if (!saveRes.success) throw new Error(saveRes.error || 'Erro ao salvar rascunho antes da transicao.')
      }

      if (!nextProposalId) throw new Error('Proposta invalida.')

      const transitionRes = await transitionProposalStatus({ proposalId: nextProposalId, action })
      if (!transitionRes.success) throw new Error(transitionRes.error || 'Falha na transicao da proposta.')

      setProposalId(nextProposalId)
      setProposalSellerBrokerId((prev) => prev ?? property?.owner_user_id ?? null)
      setProposalBuyerBrokerId((prev) => prev ?? userId ?? null)
      if (action === 'submit_review') setProposalStatus('in_review')
      if (action === 'submit_counterproposal') setProposalStatus('counterproposal')
      if (action === 'back_to_draft') setProposalStatus('draft')
      if (action === 'submit_review') {
        setProposalFeedback({ kind: 'success', message: 'Proposta enviada para analise.' })
      } else if (action === 'submit_counterproposal') {
        setProposalFeedback({ kind: 'success', message: 'Contraproposta enviada.' })
      } else if (action === 'back_to_draft') {
        setProposalFeedback({ kind: 'success', message: 'Proposta voltou para rascunho.' })
      } else if (action === 'approve') {
        setProposalFeedback({ kind: 'success', message: 'Proposta aprovada.' })
      } else if (action === 'reject') {
        setProposalFeedback({ kind: 'success', message: 'Proposta rejeitada.' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar proposta.'
      setProposalFeedback({ kind: 'error', message })
      setError(message)
    } finally {
      setProposalSubmitting(false)
      setProposalAction(null)
    }
  }

  async function handleCreateNegotiation() {
    if (!property) return
    if (!selectedPerson?.id) {
      setError('Selecione uma pessoa para criar a negociacao.')
      return
    }
    setCreatingNegotiation(true)
    setError(null)

    try {
      const res = await createPropertyNegotiation(property.id, selectedPerson.id)
      if (!res.success) throw new Error(res.error || 'Falha ao criar negociacao.')

      setNewOpen(false)
      setPeopleQuery('')
      setPeopleResults([])
      setSelectedPerson(null)

      await loadAll()

      // abre direto a proposta
      if (res.negotiation?.id) {
        void openProposalAndMarkAsRead({
          id: res.negotiation.id,
          property_id: property.id,
          person_id: selectedPerson.id,
          lead_id: res.negotiation.lead_id ?? null,
          status: res.negotiation.status ?? 'aberto',
          created_at: res.negotiation.created_at ?? new Date().toISOString(),
          updated_at: res.negotiation.updated_at ?? null,
          person_is_restricted: false,
          proposal: null,
          person: {
            id: selectedPerson.id,
            full_name: selectedPerson.full_name ?? null,
            email: selectedPerson.email ?? null,
            phone_e164: selectedPerson.phone_e164 ?? null,
          },
        })
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar negociacao.')
    } finally {
      setCreatingNegotiation(false)
    }
  }

  function buildProposalSummaryText(
    prop: PropertyRow | null,
    entity: ProposalEntity,
    draft: {
      enabled?: Partial<Record<PaymentKey, boolean>>
      amounts?: Partial<Record<PaymentKey, number>>
      installments?: DraftProposal['installments']
      notes?: string
    },
    totals: { total: number; target: number | null; diff: number }
  ) {
    const title = entity.title
    const propTitle = prop?.title || `Imóvel ${prop?.id?.slice(0, 8) || ''}`

    const lines: string[] = []
    lines.push(`PROPOSTA - ${title}`)
    lines.push(`Imóvel: ${propTitle}`)
    lines.push(`Valor imóvel: ${totals.target === null ? '-' : formatBRL(totals.target)}`)
    lines.push(`Total proposta: ${formatBRL(totals.total)}`)
    lines.push(`Comissão total: ${formatBRL(commissionValue)}`)
    lines.push(`Valor líquido proprietário: ${formatBRL(ownerNetValue)}`)
    lines.push(`Comissão corretor: ${formatBRL(brokerCommissionValue)} (${brokerSplitPercent.toFixed(2)}%)`)
    lines.push(`Comissão parceiro: ${formatBRL(partnerCommissionValue)} (${partnerSplitPercent.toFixed(2)}%)`)
    lines.push(`Comissão empresa: ${formatBRL(companyCommissionValue)}`)

    if (totals.target !== null) {
      if (totals.diff > 0) lines.push(`Falta: ${formatBRL(totals.diff)}`)
      else if (totals.diff < 0) lines.push(`Passou: ${formatBRL(Math.abs(totals.diff))}`)
      else lines.push(`Diferenca: 0 (bateu certinho)`)
    }

    lines.push('')
    lines.push('Formas:')
    ;(Object.keys(PAYMENT_LABELS) as PaymentKey[]).forEach((k) => {
      const enabled = !!draft.enabled?.[k]
      if (!enabled) return
      const v = Number(draft.amounts?.[k] ?? 0)
      lines.push(`- ${PAYMENT_LABELS[k]}: ${formatBRL(v)}`)
      if (k === 'installments' && (draft.installments?.length ?? 0) > 0) {
        draft.installments?.forEach((item) => {
          const amount = Number(item.amount ?? 0)
          lines.push(
            `  - Parcela ${Number(item.installment_no ?? 0)} (${item.due_date || '-'}) ${formatBRL(
              Number.isFinite(amount) ? amount : 0
            )}`
          )
        })
      }
    })

    if (draft.notes?.trim()) {
      lines.push('')
      lines.push('Obs:')
      lines.push(draft.notes.trim())
    }

    return lines.join('\n')
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Negociações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-[var(--muted-foreground)]">Carregando negociações...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Negociações</CardTitle>

            <div className="mt-1 text-xs text-[var(--muted-foreground)]">
              {property?.title ? (
                <>
                  <span className="font-medium text-[var(--foreground)]">{property.title}</span>
                  {categoryName ? <span className="ml-2">- {categoryName}</span> : null}
                </>
              ) : (
                <span>Imóvel {propertyId.slice(0, 8)}</span>
              )}
            </div>

            {dealBadge ? (
              <div className="mt-2">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${dealBadge.tone}`}>
                  {dealBadge.label}
                </span>
                {property?.deal_status === 'sold' ? (
                  <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                    visivel na vitrine ate {formatDate(property.deal_visible_until)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setNewOpen(true)}>
              Nova negociacao
            </Button>

            <Button
              variant="outline"
              disabled={savingDeal || !canEditDeal}
              onClick={() => setDealStatus(null)}
              title={!canEditDeal ? 'Somente responsável/admin/gestor pode marcar status comercial.' : 'Limpar status comercial'}
            >
              Limpar
            </Button>

            <Button
              variant="outline"
              disabled={savingDeal || !canEditDeal}
              onClick={() => setDealStatus('reserved')}
              title={!canEditDeal ? 'Somente responsável/admin/gestor pode marcar status comercial.' : 'Marca como reservado'}
            >
              Reservado
            </Button>

            <Button
              disabled={savingDeal || isEmpreendimento || !canEditDeal}
              onClick={() => setDealStatus('sold')}
              title={
                !canEditDeal
                  ? 'Somente responsável/admin/gestor pode marcar status comercial.'
                  : isEmpreendimento
                  ? 'Empreendimento: por enquanto, venda por unidade (entra em negociacao).'
                  : 'Marca como vendido'
              }
            >
              Vendido
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}

          {isEmpreendimento ? (
            <div className="rounded-[var(--radius)] border border-black/10 bg-black/5 p-3 text-sm text-black/70">
              <b>Empreendimento:</b> por enquanto, não marcamos "Vendido" no imóvel-base. Aqui você conduz a negociacao e
              depois a venda será por <b>unidade</b>.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Valor referencia</div>
              <div className="text-lg font-extrabold text-[var(--foreground)]">{formatCurrency(propertyValue)}</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">(usa venda/locacao automaticamente)</div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Status comercial</div>
              <div className="mt-1">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-extrabold ${
                    property?.deal_status === 'sold'
                      ? 'bg-emerald-600 text-white'
                      : property?.deal_status === 'reserved'
                      ? 'bg-amber-500 text-white'
                      : 'bg-sky-500 text-white'
                  }`}
                >
                  {property?.deal_status === 'sold'
                    ? 'Vendido'
                    : property?.deal_status === 'reserved'
                    ? 'Reservado'
                    : 'Disponivel'}
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                {property?.deal_marked_at ? `marcado em ${formatDate(property.deal_marked_at)}` : ''}
              </div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Regra vitrine</div>
              <div className="text-sm font-semibold text-[var(--foreground)]">Vendido fica 7 dias na vitrine</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">Depois some automaticamente (pela VIEW publica).</div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)]/10 p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--primary)]">Tempo publicacao</div>
              <div className="mt-1 text-sm font-extrabold text-[var(--foreground)]">{propertyPublicationLabel}</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">Indicador exibido no card e relatorios.</div>
            </div>
          </div>

          {negotiations.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma negociacao encontrada.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {kanbanColumns.map((column) => (
                    <div key={column.key} className="group rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 p-2">
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${column.tone}`}
                        >
                          {column.label}
                        </span>
                        <span className="text-xs font-semibold text-[var(--muted-foreground)]">{column.rows.length}</span>
                      </div>

                      <div className="mt-2 space-y-2">
                        {column.rows.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted-foreground)]">
                            Sem negociacoes neste status.
                          </div>
                        ) : (
                          column.rows.map((n) => {
                            const title = n.person_is_restricted
                              ? 'Cliente oculto'
                              : n.person?.full_name ||
                                n.person?.email ||
                                n.person?.phone_e164 ||
                                'Negociacao ' + n.id.slice(0, 6)
                            const proposalStatusLabel = n.proposal ? getProposalStatusLabel(n.proposal.status) : 'Sem proposta'
                            const proposalStatusTone = n.proposal
                              ? getProposalStatusTone(n.proposal.status)
                              : 'border-zinc-200 bg-zinc-100 text-zinc-700'
                            const proposalSummary =
                              n.proposal?.description?.trim() || n.proposal?.title?.trim() || 'Sem resumo da proposta.'
                            const counterpartyLabel =
                              n.proposal?.counterparty_broker?.full_name ||
                              n.proposal?.counterparty_broker?.email ||
                              (n.proposal?.counterparty_broker?.id
                                ? `Corretor ${n.proposal.counterparty_broker.id.slice(0, 8)}`
                                : '-')
                            const sentAtRaw = n.proposal?.sent_at ?? n.proposal?.updated_at ?? n.proposal?.created_at ?? null
                            const proposalEventKey = getProposalEventKey(n)
                            const isNewProposal =
                              !!n.proposal?.sent_at && !!proposalEventKey && !readProposalEvents.includes(proposalEventKey)
                            const analysisTargetProfileId =
                              n.proposal?.status === 'in_review'
                                ? n.proposal?.broker_seller_profile_id ?? property?.owner_user_id ?? null
                                : n.proposal?.status === 'counterproposal'
                                ? n.proposal?.broker_buyer_profile_id ?? property?.owner_user_id ?? null
                                : null
                            const isPendingForCurrentUser =
                              !!analysisTargetProfileId && !!userId && analysisTargetProfileId === userId

                            return (
                              <div
                                key={n.id}
                                className={`rounded-[var(--radius)] border p-3 transition-shadow hover:shadow-md ${
                                  isNewProposal
                                    ? 'border-[var(--primary)]/40 bg-[var(--primary)]/5'
                                    : 'border-[var(--border)] bg-[var(--card)]'
                                }`}
                              >
                                <div className="flex flex-col gap-3">
                                  <div className="w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2">
                                    <div className="flex min-h-[108px] flex-col justify-between gap-1.5">
                                      <span
                                        className={`inline-flex items-center justify-center rounded-lg border px-2 py-1.5 text-center text-[11px] font-extrabold leading-tight ${proposalStatusTone}`}
                                      >
                                        {proposalStatusLabel}
                                      </span>
                                      <span className="inline-flex items-center justify-center rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-2 py-1.5 text-center text-[11px] font-extrabold leading-tight text-[var(--primary-foreground)]">
                                        Total {n.proposal ? formatCurrency(n.proposal.total_value) : '-'}
                                      </span>
                                      <span
                                        className={`inline-flex items-center justify-center rounded-lg border px-2 py-1.5 text-center text-[11px] font-extrabold leading-tight ${propertyPublicationTone}`}
                                      >
                                        {propertyPublicationLabel}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="min-w-0 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">{title}</p>
                                      {isPendingForCurrentUser ? (
                                        <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                          Pendente para voce
                                        </span>
                                      ) : null}
                                      {isNewProposal ? (
                                        <span className="inline-flex items-center rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--primary)]">
                                          Nova
                                        </span>
                                      ) : null}
                                      <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted-foreground)]">
                                        Negociacao {n.status || '-'}
                                      </span>
                                    </div>

                                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                                      Resumo: <span className="text-[var(--foreground)]">{proposalSummary}</span>
                                    </p>

                                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted-foreground)]">
                                      <span>
                                        Criada em{' '}
                                        <span className="font-semibold text-[var(--foreground)]">{formatDate(n.created_at)}</span>
                                      </span>
                                      <span>
                                        Enviada em{' '}
                                        <span className="font-semibold text-[var(--foreground)]">{formatDateTime(sentAtRaw)}</span>
                                      </span>
                                      <span>
                                        Outra ponta <span className="font-semibold text-[var(--foreground)]">{counterpartyLabel}</span>
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                      <Button
                                        variant="outline"
                                        onClick={() => void openProposalAndMarkAsRead(n)}
                                        disabled={!n.person_id}
                                      >
                                        {n.proposal ? 'Abrir proposta' : 'Montar proposta'}
                                      </Button>

                                      {n.lead_id ? (
                                        <Link
                                          href={`/leads/${n.lead_id}`}
                                          className="text-xs font-medium text-[var(--primary)] hover:underline"
                                        >
                                          Abrir lead
                                        </Link>
                                      ) : n.person_id && !n.person_is_restricted ? (
                                        <Link
                                          href={`/people/${n.person_id}`}
                                          className="text-xs font-medium text-[var(--primary)] hover:underline"
                                        >
                                          Abrir pessoa
                                        </Link>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal - Nova negociacao */}
      {newOpen ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto my-4 w-full max-w-xl rounded-2xl bg-white shadow-xl border border-black/10">
            <div className="p-4 border-b border-black/10 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-black/60">Negociacao</div>
                <div className="text-lg font-extrabold text-black/90">Nova negociacao</div>
                <div className="mt-1 text-sm text-black/60">
                  Cria/seleciona uma <b>Pessoa</b> e abre o "Montar proposta".
                </div>
              </div>
              <Button variant="outline" onClick={() => setNewOpen(false)}>
                Fechar
              </Button>
            </div>

            <div className="p-4 space-y-3">
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-black/60">Buscar pessoa</div>
                  <input
                    value={peopleQuery}
                    onChange={(e) => setPeopleQuery(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    placeholder="Nome, e-mail ou documento"
                  />
                </div>

                <div className="space-y-2">
                  {peopleLoading ? (
                    <p className="text-xs text-black/60">Buscando pessoas...</p>
                  ) : null}

                  {!peopleLoading && peopleQuery.trim() && peopleResults.length === 0 ? (
                    <p className="text-xs text-black/60">Nenhuma pessoa encontrada.</p>
                  ) : null}

                  {peopleResults.map((person) => {
                    const isSelected = selectedPerson?.id === person.id
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => setSelectedPerson(person)}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                          isSelected ? 'border-black/40 bg-black/5' : 'border-black/10 bg-white hover:bg-black/5'
                        }`}
                      >
                        <div className="font-semibold text-black/90">
                          {person.full_name || person.email || person.phone_e164 || `Pessoa ${person.id.slice(0, 6)}`}
                        </div>
                        <div className="text-xs text-black/60">
                          {[person.email, person.phone_e164, person.document_id].filter(Boolean).join(' - ')}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {selectedPerson ? (
                  <div className="rounded-xl border border-black/10 bg-black/5 p-3 text-sm">
                    <div className="text-xs text-black/60">Selecionado</div>
                    <div className="font-semibold text-black/90">
                      {selectedPerson.full_name ||
                        selectedPerson.email ||
                        selectedPerson.phone_e164 ||
                        `Pessoa ${selectedPerson.id.slice(0, 6)}`}
                    </div>
                    <div className="text-xs text-black/60">
                      {[selectedPerson.email, selectedPerson.phone_e164].filter(Boolean).join(' - ')}
                    </div>
                    <div className="mt-2">
                      <Button variant="outline" onClick={() => setSelectedPerson(null)}>
                        Trocar pessoa
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Link
                  href="/pessoas"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-all duration-150 hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                >
                  Criar nova pessoa
                </Link>
                <Button variant="outline" onClick={() => setNewOpen(false)} disabled={creatingNegotiation}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateNegotiation} disabled={creatingNegotiation || !selectedPerson}>
                  {creatingNegotiation ? 'Criando...' : 'Criar negociacao'}
                </Button>
              </div>
              <p className="text-xs text-black/60">Cadastre a pessoa e volte aqui para pesquisar.</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Proposta */}
      {proposalOpen && proposalEntity ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto my-4 w-full max-w-3xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-white shadow-xl border border-black/10">
            <div className="p-4 border-b border-black/10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-black/60">Proposta</div>
                <div className="text-lg font-extrabold text-black/90 truncate">{proposalEntity.title}</div>
                <div className="mt-1 text-sm text-black/60">
                  Valor do imóvel: <b>{formatCurrency(propertyValue)}</b>
                </div>
                <div className="mt-1 text-xs text-black/60">
                  Status da proposta: <b>{getProposalStatusLabel(proposalStatus)}</b>
                </div>
                <div className="mt-1 text-xs text-black/60">
                  ID proposta: <b>{proposalId ? proposalId.slice(0, 12) : 'novo'}</b> - ID negociacao:{' '}
                  <b>{proposalEntity.negotiation_id.slice(0, 12)}</b>
                </div>
                {proposalRoleChips.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {proposalRoleChips.map((chip) => (
                      <span
                        key={chip}
                        className="inline-flex items-center rounded-full border border-black/15 bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-black/70"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden md:block rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-right">
                  <div className="text-[11px] text-black/60">Total atual</div>
                  <div className="text-sm font-extrabold text-black/90">{formatCurrency(proposalTotals.total)}</div>
                  <div className="text-[11px] text-black/60">{proposalDiffSummary}</div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    saveProposalDraftLocal(proposalEntity.person_id, proposalDraft)
                    setProposalOpen(false)
                    setProposalEntity(null)
                    setProposalFeedback(null)
                  }}
                >
                  Fechar
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {proposalLoading ? (
                <div className="rounded-xl border border-black/10 bg-black/5 p-3 text-sm text-black/70">
                  Carregando proposta do banco...
                </div>
              ) : null}
              {proposalFeedback ? (
                <div
                  className={`rounded-xl border p-3 text-sm ${
                    proposalFeedback.kind === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {proposalFeedback.message}
                </div>
              ) : null}
              {isProposalDraftEditable && canManageProposal && !hasEnabledPaymentMethod ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Selecione pelo menos uma forma de pagamento para enviar a proposta.
                </div>
              ) : null}
              {isProposalDraftEditable && canManageProposal && hasEnabledPaymentMethod && proposalTotals.total <= 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  O total da proposta precisa ser maior que zero para enviar.
                </div>
              ) : null}
              {isProposalDraftEditable && canManageProposal && !isCommissionPercentValid ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  O percentual de comissao deve estar entre 0% e 100%.
                </div>
              ) : null}
              {isProposalDraftEditable && canManageProposal && !isSplitPercentValid ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  A soma dos splits (corretor + parceiro) esta acima de 100%. Ajuste no imovel antes de enviar.
                </div>
              ) : null}
              {isProposalDraftEditable && canManageProposal && installmentsRequireDetails && !hasInstallmentsRows ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Parcelado direto ativo: gere ao menos uma parcela com vencimento e valor.
                </div>
              ) : null}
              {isProposalDraftEditable && canManageProposal && hasInstallmentsInvalidRow ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Existe parcela sem valor positivo ou sem vencimento.
                </div>
              ) : null}
              {isProposalDraftEditable && canManageProposal && installmentsSummaryMismatch ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                  Total do campo parcelado direto diferente da soma das parcelas. Ao salvar, a soma das parcelas sera usada.
                </div>
              ) : null}

              {/* Comissao */}
              <div className="rounded-2xl border border-black/10 p-4">
                <div>
                  <div className="text-sm font-extrabold text-black/90">Comissao</div>
                  <div className="text-sm text-black/60">
                    Snapshot financeiro da proposta (comissao, liquido do proprietario e splits).
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <div className="text-xs text-black/60">Base de calculo</div>
                    <div className="mt-1 rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-sm font-semibold text-black/90">
                      {formatCurrency(commissionBaseValue)}
                    </div>
                    <div className="mt-1 text-xs text-black/60">
                      Usa total da proposta; se vazio, usa valor do imovel.
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-black/60">% comissao</div>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      disabled={!isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                      value={Number.isFinite(commissionPercent) ? commissionPercent : 0}
                      onChange={(e) => setCommissionPercent(parseFloat(e.target.value || '0'))}
                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                    />
                    <div className="mt-1 text-xs text-black/60">Herdado do imovel e editavel na proposta.</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-black/10 bg-black/5 p-3">
                    <div className="text-xs text-black/60">Comissao total</div>
                    <div className="text-base font-extrabold text-black/90">{formatCurrency(commissionValue)}</div>
                  </div>
                  <div className="rounded-xl border border-black/10 bg-black/5 p-3">
                    <div className="text-xs text-black/60">Liquido proprietario</div>
                    <div className="text-base font-extrabold text-black/90">{formatCurrency(ownerNetValue)}</div>
                  </div>
                  <div className="rounded-xl border border-black/10 bg-black/5 p-3">
                    <div className="text-xs text-black/60">Corretor ({brokerSplitPercent.toFixed(2)}%)</div>
                    <div className="text-base font-extrabold text-black/90">{formatCurrency(brokerCommissionValue)}</div>
                  </div>
                  <div className="rounded-xl border border-black/10 bg-black/5 p-3">
                    <div className="text-xs text-black/60">Parceiro ({partnerSplitPercent.toFixed(2)}%)</div>
                    <div className="text-base font-extrabold text-black/90">{formatCurrency(partnerCommissionValue)}</div>
                  </div>
                  <div className="rounded-xl border border-black/10 bg-black/5 p-3">
                    <div className="text-xs text-black/60">Empresa (saldo)</div>
                    <div className="text-base font-extrabold text-black/90">{formatCurrency(companyCommissionValue)}</div>
                  </div>
                </div>
              </div>

              {/* Formas de pagamento */}
              <div className="rounded-2xl border border-black/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold text-black/90">Formas de pagamento</div>
                    <div className="text-sm text-black/60">Selecione uma ou varias e preencha valores.</div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => {
                      const text = buildProposalSummaryText(property, proposalEntity, proposalDraft, proposalTotals)
                      navigator.clipboard?.writeText(text)
                    }}
                  >
                    Copiar resumo
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {(Object.keys(PAYMENT_LABELS) as PaymentKey[]).map((k) => {
                    const enabled = !!proposalDraft.enabled?.[k]
                    const amount = Number(proposalDraft.amounts?.[k] ?? 0)

                    return (
                      <div
                        key={k}
                        className={`rounded-xl border border-black/10 p-3 transition-colors ${
                          enabled ? 'bg-white' : 'bg-black/[0.02]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-semibold text-black/90">
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={!isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                              onChange={(e) => {
                                const isEnabled = e.target.checked
                                const next = {
                                  ...proposalDraft,
                                  enabled: { ...(proposalDraft.enabled || {}), [k]: isEnabled },
                                  installments:
                                    !isEnabled && k === 'installments' ? [] : proposalDraft.installments || [],
                                  amounts:
                                    !isEnabled && k === 'installments'
                                      ? { ...(proposalDraft.amounts || {}), installments: 0 }
                                      : proposalDraft.amounts || {},
                                }
                                setProposalDraft(next)
                                saveProposalDraftLocal(proposalEntity.person_id, next)
                              }}
                            />
                            {PAYMENT_LABELS[k]}
                          </label>

                          {enabled ? (
                            <Badge variant="outline" className="text-xs">
                              ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs opacity-60">
                              -
                            </Badge>
                          )}
                        </div>

                        <div
                          className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                            enabled ? 'mt-3 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
                          }`}
                        >
                          <div className="min-h-0">
                            <div className="text-xs text-black/60">Valor</div>
                            <input
                              type="number"
                              step="0.01"
                              disabled={!enabled || !isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                              value={Number.isFinite(amount) ? amount : 0}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value || '0')
                                const next = {
                                  ...proposalDraft,
                                  amounts: { ...(proposalDraft.amounts || {}), [k]: Number.isFinite(v) ? v : 0 },
                                }
                                setProposalDraft(next)
                                saveProposalDraftLocal(proposalEntity.person_id, next)
                              }}
                              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                            />
                            <div className="mt-1 text-xs text-black/60">{formatCurrency(amount)}</div>

                            {k === 'installments' ? (
                              <div className="mt-4 rounded-xl border border-black/10 bg-black/5 p-3 space-y-3">
                                <div className="text-xs font-semibold text-black/70">Detalhamento das parcelas</div>
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                  <div>
                                    <div className="text-[11px] text-black/60">Quantidade</div>
                                    <input
                                      type="number"
                                      min={1}
                                      max={120}
                                      value={installmentCount}
                                      disabled={!enabled || !isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                                      onChange={(e) => {
                                        const next = Number(e.target.value)
                                        setInstallmentCount(Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1)
                                      }}
                                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                                    />
                                  </div>
                                  <div>
                                    <div className="text-[11px] text-black/60">1 vencimento</div>
                                    <input
                                      type="date"
                                      value={installmentFirstDueDate}
                                      disabled={!enabled || !isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                                      onChange={(e) => setInstallmentFirstDueDate(e.target.value)}
                                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      variant="outline"
                                      className="w-full"
                                      disabled={!enabled || !isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                                      onClick={() => {
                                        const plan = buildInstallmentPlan(
                                          Number(proposalDraft.amounts?.installments ?? 0),
                                          installmentCount,
                                          installmentFirstDueDate
                                        )
                                        applyInstallmentsDraft(plan)
                                      }}
                                    >
                                      Gerar parcelas
                                    </Button>
                                  </div>
                                </div>

                                {(proposalDraft.installments?.length ?? 0) > 0 ? (
                                  <div className="space-y-2">
                                    {(proposalDraft.installments ?? []).map((row, index) => (
                                      <div
                                        key={`${row.installment_no}-${index}`}
                                        className="grid grid-cols-1 gap-2 rounded-xl border border-black/10 bg-white p-2 md:grid-cols-[80px,1fr,140px,40px]"
                                      >
                                        <div className="flex items-center justify-center rounded-lg border border-black/10 text-xs font-semibold text-black/70">
                                          #{index + 1}
                                        </div>
                                        <input
                                          type="date"
                                          value={row.due_date || ''}
                                          disabled={!enabled || !isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                                          onChange={(e) => {
                                            const nextRows = [...(proposalDraft.installments ?? [])]
                                            nextRows[index] = { ...nextRows[index], due_date: e.target.value }
                                            applyInstallmentsDraft(nextRows)
                                          }}
                                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                                        />
                                        <input
                                          type="number"
                                          step="0.01"
                                          min={0}
                                          value={Number.isFinite(Number(row.amount ?? 0)) ? Number(row.amount ?? 0) : 0}
                                          disabled={!enabled || !isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                                          onChange={(e) => {
                                            const value = parseFloat(e.target.value || '0')
                                            const nextRows = [...(proposalDraft.installments ?? [])]
                                            nextRows[index] = {
                                              ...nextRows[index],
                                              amount: Number.isFinite(value) ? value : 0,
                                            }
                                            applyInstallmentsDraft(nextRows)
                                          }}
                                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                                        />
                                        <button
                                          type="button"
                                          disabled={!enabled || !isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                                          onClick={() => {
                                            const nextRows = (proposalDraft.installments ?? []).filter((_, i) => i !== index)
                                            applyInstallmentsDraft(nextRows)
                                          }}
                                          className="inline-flex h-10 items-center justify-center rounded-xl border border-black/10 text-xs font-bold text-black/60 hover:bg-black/5 disabled:opacity-50"
                                          title="Remover parcela"
                                        >
                                          x
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-black/60">Nenhuma parcela gerada.</div>
                                )}

                                <div className="flex items-center justify-between gap-2">
                                  <Button
                                    variant="outline"
                                    disabled={!enabled || !isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                                    onClick={() => {
                                      const currentInstallments = proposalDraft.installments ?? []
                                      const baseDate =
                                        (currentInstallments.length > 0
                                          ? currentInstallments[currentInstallments.length - 1]?.due_date
                                          : null) || installmentFirstDueDate
                                      const nextRows = [
                                        ...currentInstallments,
                                        {
                                          installment_no: currentInstallments.length + 1,
                                          amount: 0,
                                          due_date: addMonthsToDateInput(baseDate, 1),
                                          note: null,
                                        },
                                      ]
                                      applyInstallmentsDraft(nextRows)
                                    }}
                                  >
                                    Adicionar parcela
                                  </Button>
                                  <div className="text-xs text-black/60">
                                    Soma parcelas:{' '}
                                    <span className="font-semibold text-black/80">{formatCurrency(installmentsTotal)}</span>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Totais */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs text-black/60">Total da proposta</div>
                  <div className="text-2xl font-extrabold text-black/90">{formatCurrency(proposalTotals.total)}</div>
                </div>

                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs text-black/60">Valor do imóvel</div>
                  <div className="text-2xl font-extrabold text-black/90">{formatCurrency(proposalTotals.target)}</div>
                </div>

                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs text-black/60">Diferenca</div>
                  <div className="text-2xl font-extrabold text-black/90">
                    {proposalTotals.target === null ? '-' : formatCurrency(proposalTotals.diff)}
                  </div>
                  <div className="mt-1 text-xs text-black/60">{proposalDiffSummary}</div>
                </div>
              </div>

              {/* Observacoes */}
              <div className="rounded-2xl border border-black/10 p-4">
                <div className="text-sm font-extrabold text-black/90">Observacoes</div>
                <textarea
                  value={proposalDraft.notes || ''}
                  disabled={!isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                  onChange={(e) => {
                    const next = { ...proposalDraft, notes: e.target.value }
                    setProposalDraft(next)
                    saveProposalDraftLocal(proposalEntity.person_id, next)
                  }}
                  className="mt-2 w-full min-h-[110px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                  placeholder="Condicoes, prazos, itens inclusos, desconto aprovado, etc."
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                {isProposalDraftEditable && canManageProposal ? (
                  <Button variant="outline" onClick={handleSaveProposalDraft} disabled={proposalSubmitting || proposalLoading}>
                    {proposalSubmitting && proposalAction === 'save' ? 'Salvando...' : 'Salvar rascunho'}
                  </Button>
                ) : null}

                {isProposalDraftEditable && canManageProposal ? (
                  <Button
                    onClick={() => handleTransitionProposal('submit_review')}
                    disabled={!canSubmitProposal || proposalSubmitting || proposalLoading}
                    title={!canSubmitProposal ? 'Revise total, percentual de comissao, splits e parcelas.' : undefined}
                  >
                    {proposalSubmitting && proposalAction === 'submit_review' ? 'Em analise...' : 'Enviar para analise'}
                  </Button>
                ) : null}

                {isProposalDraftEditable && canManageProposal ? (
                  <Button
                    variant="outline"
                    onClick={() => handleTransitionProposal('submit_counterproposal')}
                    disabled={!canSubmitProposal || proposalSubmitting || proposalLoading}
                    title={!canSubmitProposal ? 'Revise total, percentual de comissao, splits e parcelas.' : undefined}
                  >
                    {proposalSubmitting && proposalAction === 'submit_counterproposal'
                      ? 'Enviando contraproposta...'
                      : 'Enviar contraproposta'}
                  </Button>
                ) : null}

                {!isProposalDraftEditable && canBackToDraft ? (
                  <Button
                    variant="outline"
                    onClick={() => handleTransitionProposal('back_to_draft')}
                    disabled={proposalSubmitting || proposalLoading}
                  >
                    {proposalSubmitting && proposalAction === 'back_to_draft' ? 'Voltando...' : 'Voltar para rascunho'}
                  </Button>
                ) : null}

                {canShowApproveReject ? (
                  <Button
                    onClick={() => handleTransitionProposal('approve')}
                    disabled={proposalSubmitting || proposalLoading}
                  >
                    {proposalSubmitting && proposalAction === 'approve' ? 'Aprovando proposta...' : 'Aprovar'}
                  </Button>
                ) : null}

                {canShowApproveReject ? (
                  <Button
                    variant="outline"
                    onClick={() => handleTransitionProposal('reject')}
                    disabled={proposalSubmitting || proposalLoading}
                  >
                    {proposalSubmitting && proposalAction === 'reject' ? 'Rejeitando proposta...' : 'Rejeitar'}
                  </Button>
                ) : null}

                <Button
                  variant="outline"
                  onClick={() => {
                    saveProposalDraftLocal(proposalEntity.person_id, proposalDraft)
                    setProposalOpen(false)
                    setProposalEntity(null)
                    setProposalFeedback(null)
                  }}
                >
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
