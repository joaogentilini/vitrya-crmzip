'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AdminDeleteActionButton from '@/components/admin/AdminDeleteActionButton'
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
  deletePropertyNegotiationAction,
  type PersonSearchRow,
} from '../actions'

type PropertyRow = {
  id: string
  owner_user_id: string | null
  title: string | null
  purpose: string | null
  price: number | null
  rent_price: number | null
  property_category_id: string | null
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
  createCommissionAction?: (formData: FormData) => Promise<any>
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

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function getProposalStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'in_review':
      return 'Em análise'
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
  createCommissionAction,
}: Props) {
  const [property, setProperty] = useState<PropertyRow | null>(null)
  const [negotiations, setNegotiations] = useState<NegotiationRow[]>([])
  const [loading, setLoading] = useState(true)

  const [savingDeal, setSavingDeal] = useState(false)
  const [creatingNegotiation, setCreatingNegotiation] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // comissão (UI)
  const [commissionGross, setCommissionGross] = useState<number>(0)
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

  const dealBadge = useMemo(() => {
    if (!property?.deal_status) return null
    if (property.deal_status === 'reserved') return { label: 'Reservado', tone: 'bg-amber-500 text-white' }
    if (property.deal_status === 'sold') return { label: 'Vendido', tone: 'bg-emerald-600 text-white' }
    return null
  }, [property?.deal_status])

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

  const canSubmitProposal = isProposalDraftEditable && canManageProposal && hasEnabledPaymentMethod && proposalTotals.total > 0

  const proposalDiffSummary = useMemo(() => {
    if (proposalTotals.target === null) return 'Sem valor de referencia do imóvel.'
    if (proposalTotals.diff === 0) return 'Valor da proposta alinhado com o imóvel.'
    if (proposalTotals.diff > 0) return `Faltam ${formatCurrency(proposalTotals.diff)} para chegar no valor do imóvel.`
    return `Proposta acima em ${formatCurrency(Math.abs(proposalTotals.diff))}.`
  }, [proposalTotals])

 async function loadAll() {
  setLoading(true)
  setError(null)

  try {
    // auth + role
    const { data: userRes } = await supabase.auth.getUser()
    const uid = userRes?.user?.id ?? null;
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
          price,
          rent_price,
          property_category_id,
          deal_status,
          deal_marked_at,
          deal_visible_until,
          property_categories ( name )
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

    const base = Number(propertyValue ?? 0)
    setCommissionGross(Number.isFinite(base) ? base : 0)
    setCommissionPercent(5)

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
        setCommissionPercent(Number(proposal.commission_percent ?? 0))
        setCommissionGross(Number(proposal.commission_value ?? propertyValue ?? 0))
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
      saveProposalDraftLocal(personId, nextDraft)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar proposta.'
      setError(message)
    } finally {
      setProposalLoading(false)
    }
  }

  function buildProposalPayload() {
    const payments = (Object.keys(PAYMENT_LABELS) as PaymentKey[])
      .filter((k) => !!proposalDraft.enabled?.[k])
      .map((k) => ({
        method: k,
        amount: Number(proposalDraft.amounts?.[k] ?? 0),
        due_date: null as string | null,
        details: null as string | null,
      }))

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

    return {
      negotiationId: proposalEntity?.negotiation_id || '',
      title: proposalEntity?.title || 'Proposta',
      description: proposalDraft.notes || '',
      commission_percent: Number.isFinite(commissionPercent) ? commissionPercent : null,
      commission_value: Number.isFinite(commissionGross) ? commissionGross : null,
      payments,
      installments,
    }
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
        if (!saveRes.success) throw new Error(saveRes.error || 'Erro ao salvar rascunho antes da transição.')
        nextProposalId = saveRes.proposalId
      } else if (proposalStatus === 'draft' && action !== 'back_to_draft') {
        const saveRes = await saveProposalDraftBundle(buildProposalPayload())
        if (!saveRes.success) throw new Error(saveRes.error || 'Erro ao salvar rascunho antes da transição.')
      }

      if (!nextProposalId) throw new Error('Proposta inválida.')

      const transitionRes = await transitionProposalStatus({ proposalId: nextProposalId, action })
      if (!transitionRes.success) throw new Error(transitionRes.error || 'Falha na transição da proposta.')

      setProposalId(nextProposalId)
      setProposalSellerBrokerId((prev) => prev ?? property?.owner_user_id ?? null)
      setProposalBuyerBrokerId((prev) => prev ?? userId ?? null)
      if (action === 'submit_review') setProposalStatus('in_review')
      if (action === 'submit_counterproposal') setProposalStatus('counterproposal')
      if (action === 'back_to_draft') setProposalStatus('draft')
      if (action === 'submit_review') {
        setProposalFeedback({ kind: 'success', message: 'Proposta enviada para análise.' })
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
    draft: { enabled?: any; amounts?: any; notes?: string },
    totals: { total: number; target: number | null; diff: number }
  ) {
    const title = entity.title
    const propTitle = prop?.title || `Imóvel ${prop?.id?.slice(0, 8) || ''}`

    const lines: string[] = []
    lines.push(`PROPOSTA - ${title}`)
    lines.push(`Imóvel: ${propTitle}`)
    lines.push(`Valor imóvel: ${totals.target === null ? '-' : formatBRL(totals.target)}`)
    lines.push(`Total proposta: ${formatBRL(totals.total)}`)

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
                    visível na vitrine até {formatDate(property.deal_visible_until)}
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

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Valor referencia</div>
              <div className="text-lg font-extrabold text-[var(--foreground)]">{formatCurrency(propertyValue)}</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">(usa venda/locacao automaticamente)</div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Status comercial</div>
              <div className="text-lg font-extrabold text-[var(--foreground)]">
                {property?.deal_status ? (property.deal_status === 'sold' ? 'Vendido' : 'Reservado') : '-'}
              </div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                {property?.deal_marked_at ? `marcado em ${formatDate(property.deal_marked_at)}` : ''}
              </div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Regra vitrine</div>
              <div className="text-sm font-semibold text-[var(--foreground)]">Vendido fica 7 dias na vitrine</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">Depois some automaticamente (pela VIEW pública).</div>
            </div>
          </div>

          {negotiations.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma negociacao encontrada.</p>
          ) : (
            <div className="space-y-2">
              {negotiations.map((n) => {
                const title = n.person_is_restricted
                  ? 'Cliente oculto'
                  : n.person?.full_name || n.person?.email || n.person?.phone_e164 || ('Negociacao ' + n.id.slice(0, 6))
                const proposalStatusLabel = n.proposal ? getProposalStatusLabel(n.proposal.status) : 'Sem proposta'
                const proposalSummary =
                  n.proposal?.description?.trim() || n.proposal?.title?.trim() || 'Sem resumo da proposta.'
                const counterpartyLabel =
                  n.proposal?.counterparty_broker?.full_name ||
                  n.proposal?.counterparty_broker?.email ||
                  (n.proposal?.counterparty_broker?.id ? `Corretor ${n.proposal.counterparty_broker.id.slice(0, 8)}` : '-')
                const sentAtRaw = n.proposal?.sent_at ?? n.proposal?.updated_at ?? n.proposal?.created_at ?? null
                const proposalEventKey = getProposalEventKey(n)
                const isNewProposal =
                  !!n.proposal?.sent_at && !!proposalEventKey && !readProposalEvents.includes(proposalEventKey)
                return (
                  <div
                    key={n.id}
                    className={`flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius)] border p-3 text-sm ${
                      isNewProposal
                        ? 'border-[var(--primary)]/40 bg-[var(--primary)]/5'
                        : 'border-[var(--border)] bg-[var(--card)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-[var(--foreground)]">{title}</p>
                        {isNewProposal ? (
                          <span className="inline-flex items-center rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--primary)]">
                            Nova
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)]">Criada em {formatDate(n.created_at)}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Status negociacao: <span className="font-semibold text-[var(--foreground)]">{n.status || '-'}</span>
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Status proposta: <span className="font-semibold text-[var(--foreground)]">{proposalStatusLabel}</span>
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Resumo: <span className="text-[var(--foreground)]">{proposalSummary}</span>
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Outra ponta: <span className="font-medium text-[var(--foreground)]">{counterpartyLabel}</span>
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Enviada em: <span className="font-medium text-[var(--foreground)]">{formatDateTime(sentAtRaw)}</span>
                      </p>
                      {n.proposal ? (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Total proposta:{' '}
                          <span className="font-semibold text-[var(--foreground)]">{formatCurrency(n.proposal.total_value)}</span>
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => void openProposalAndMarkAsRead(n)} disabled={!n.person_id}>
                        {n.proposal ? 'Abrir proposta' : 'Montar proposta'}
                      </Button>

                      {userRole === 'admin' ? (
                        <AdminDeleteActionButton
                          action={deletePropertyNegotiationAction.bind(null, n.id)}
                          confirmMessage="Deseja excluir esta negociacao? As propostas e pagamentos vinculados tambem serao removidos."
                          successMessage="Negociacao excluida com sucesso."
                          fallbackErrorMessage="Nao foi possivel excluir a negociacao."
                          label="Excluir"
                          size="sm"
                          onSuccess={() => {
                            void loadAll()
                          }}
                        />
                      ) : null}

                      {n.lead_id ? (
                        <Link href={`/leads/${n.lead_id}`} className="text-xs font-medium text-[var(--primary)] hover:underline">
                          Abrir lead
                        </Link>
                      ) : n.person_id && !n.person_is_restricted ? (
                        <Link href={`/people/${n.person_id}`} className="text-xs font-medium text-[var(--primary)] hover:underline">
                          Abrir pessoa
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )
              })}
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

              {/* Comissão */}
              <div className="rounded-2xl border border-black/10 p-4">
                <div>
                  <div className="text-sm font-extrabold text-black/90">Comissão</div>
                  <div className="text-sm text-black/60">Salva a comissão vinculada a negociacao.</div>
                </div>

                {!createCommissionAction ? (
                  <div className="mt-3 text-sm text-black/60">Action de comissão não injetada (wrapper server faltando).</div>
                ) : (
                  <form action={createCommissionAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input type="hidden" name="negotiationId" value={proposalEntity.negotiation_id} />

                    <div className="md:col-span-2">
                      <div className="text-xs text-black/60">Valor bruto</div>
                      <input
                        name="grossValue"
                        type="number"
                        step="0.01"
                        disabled={!isProposalDraftEditable || proposalSubmitting}
                        value={Number.isFinite(commissionGross) ? commissionGross : 0}
                        onChange={(e) => setCommissionGross(parseFloat(e.target.value || '0'))}
                        className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                      />
                      <div className="mt-1 text-xs text-black/60">{formatCurrency(commissionGross)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-black/60">% comissão</div>
                      <input
                        name="commissionPercent"
                        type="number"
                        step="0.01"
                        disabled={!isProposalDraftEditable || proposalSubmitting}
                        value={Number.isFinite(commissionPercent) ? commissionPercent : 0}
                        onChange={(e) => setCommissionPercent(parseFloat(e.target.value || '0'))}
                        className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                      />
                      <div className="mt-1 text-xs text-black/60">ex: 5,00%</div>
                    </div>

                    {isProposalDraftEditable && canManageProposal ? (
                      <div className="md:col-span-3 flex items-center justify-end gap-2">
                        <Button type="submit" disabled={proposalSubmitting}>
                          Salvar comissão
                        </Button>
                      </div>
                    ) : null}
                  </form>
                )}
              </div>

              {/* Formas de pagamento */}
              <div className="rounded-2xl border border-black/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold text-black/90">Formas de pagamento</div>
                    <div className="text-sm text-black/60">Selecione uma ou várias e preencha valores.</div>
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
                      <div key={k} className="rounded-xl border border-black/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-semibold text-black/90">
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={!isProposalDraftEditable || !canManageProposal || proposalSubmitting}
                              onChange={(e) => {
                                const next = {
                                  ...proposalDraft,
                                  enabled: { ...(proposalDraft.enabled || {}), [k]: e.target.checked },
                                  installments:
                                    !e.target.checked && k === 'installments' ? [] : proposalDraft.installments || [],
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

                        <div className="mt-3">
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
                    title={!canSubmitProposal ? 'Selecione forma(s) de pagamento e total maior que zero.' : undefined}
                  >
                    {proposalSubmitting && proposalAction === 'submit_review' ? 'Em análise...' : 'Enviar para análise'}
                  </Button>
                ) : null}

                {isProposalDraftEditable && canManageProposal ? (
                  <Button
                    variant="outline"
                    onClick={() => handleTransitionProposal('submit_counterproposal')}
                    disabled={!canSubmitProposal || proposalSubmitting || proposalLoading}
                    title={!canSubmitProposal ? 'Selecione forma(s) de pagamento e total maior que zero.' : undefined}
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



