'use client'

import { useEffect, useMemo, useState } from 'react'
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
  cash: 'À vista',
  installments: 'Parcelado direto',
  financing: 'Financiamento',
  consortium: 'Consórcio',
  trade: 'Permuta',
  other: 'Outro',
}

type DraftProposal = {
  enabled: Partial<Record<PaymentKey, boolean>>
  amounts: Partial<Record<PaymentKey, number>>
  notes?: string
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

type NegotiationRow = {
  id: string
  property_id: string
  person_id: string | null
  status: string | null
  created_at: string | null
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
  createCommissionAction?: (formData: FormData) => Promise<any>
}

const draftKey = (propertyId: string, personId: string) => `vitrya:proposal:${propertyId}:${personId}`

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function isEmpreendimentoByCategoryName(name?: string | null) {
  if (!name) return false
  const n = name.toLowerCase()
  return (
    n.includes('empreendimento') ||
    n.includes('incorpora') ||
    n.includes('lançamento') ||
    n.includes('lancamento')
  )
}

export default function PropertyNegotiationsTabClient({ propertyId, createCommissionAction }: Props) {
  const [property, setProperty] = useState<PropertyRow | null>(null)
  const [negotiations, setNegotiations] = useState<NegotiationRow[]>([])
  const [loading, setLoading] = useState(true)

  const [savingDeal, setSavingDeal] = useState(false)
  const [creatingNegotiation, setCreatingNegotiation] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // comissão (UI)
  const [commissionGross, setCommissionGross] = useState<number>(0)
  const [commissionPercent, setCommissionPercent] = useState<number>(5)

  // auth/profile (permissões UI)
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
  const [proposalDraft, setProposalDraft] = useState<DraftProposal>({
    enabled: { cash: true },
    amounts: { cash: 0 },
    notes: '',
  })

  // Modal criar negociação
  const [newOpen, setNewOpen] = useState(false)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [peopleResults, setPeopleResults] = useState<PersonSearchRow[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<PersonSearchRow | null>(null)

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

      // ✅ agora lista pela tabela certa
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
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId])

  useEffect(() => {
    if (!newOpen) {
      setPeopleQuery('')
      setPeopleResults([])
      setPeopleLoading(false)
      setSelectedPerson(null)
    }
  }, [newOpen])

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

  function openProposalFromNegotiation(n: NegotiationRow) {
    const personId = n.person_id
    if (!personId) {
      setError('Negociação sem Pessoa vinculada. Corrija a vinculação antes da proposta.')
      return
    }

    const entity: ProposalEntity = {
      negotiation_id: n.id,
      person_id: personId,
      title: n.person?.full_name || n.person?.email || n.person?.phone_e164 || `Pessoa ${personId.slice(0, 6)}`,
      created_at: n.created_at ?? null,
      status: n.status ?? 'proposta',
      value_estimate: null,
      name: n.person?.full_name ?? null,
      email: n.person?.email ?? null,
      phone_e164: n.person?.phone_e164 ?? null,
    }

    setProposalEntity(entity)

    try {
      const raw = localStorage.getItem(draftKey(propertyId, personId))
      if (raw) {
        const parsed = JSON.parse(raw) as DraftProposal
        setProposalDraft({
          enabled: parsed.enabled || {},
          amounts: parsed.amounts || {},
          notes: parsed.notes || '',
        })
      } else {
        setProposalDraft({ enabled: { cash: true }, amounts: { cash: 0 }, notes: '' })
      }
    } catch {
      setProposalDraft({ enabled: { cash: true }, amounts: { cash: 0 }, notes: '' })
    }

    const base = Number(propertyValue ?? 0)
    setCommissionGross(Number.isFinite(base) ? base : 0)

    setProposalOpen(true)
  }

  async function handleCreateNegotiation() {
    if (!property) return
    if (!selectedPerson?.id) {
      setError('Selecione uma pessoa para criar a negociação.')
      return
    }
    setCreatingNegotiation(true)
    setError(null)

    try {
      const res = await createPropertyNegotiation(property.id, selectedPerson.id)
      if (!res.success) throw new Error(res.error || 'Falha ao criar negociação.')

      setNewOpen(false)
      setPeopleQuery('')
      setPeopleResults([])
      setSelectedPerson(null)

      await loadAll()

      // abre direto a proposta
      if (res.negotiation?.id) {
        openProposalFromNegotiation({
          id: res.negotiation.id,
          property_id: property.id,
          person_id: selectedPerson.id,
          lead_id: res.negotiation.lead_id ?? null,
          status: res.negotiation.status ?? 'aberto',
          created_at: res.negotiation.created_at ?? new Date().toISOString(),
          updated_at: res.negotiation.updated_at ?? null,
          person: {
            id: selectedPerson.id,
            full_name: selectedPerson.full_name ?? null,
            email: selectedPerson.email ?? null,
            phone_e164: selectedPerson.phone_e164 ?? null,
          },
        })
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar negociação.')
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
    lines.push(`PROPOSTA • ${title}`)
    lines.push(`Imóvel: ${propTitle}`)
    lines.push(`Valor imóvel: ${totals.target === null ? '—' : formatBRL(totals.target)}`)
    lines.push(`Total proposta: ${formatBRL(totals.total)}`)

    if (totals.target !== null) {
      if (totals.diff > 0) lines.push(`Falta: ${formatBRL(totals.diff)}`)
      else if (totals.diff < 0) lines.push(`Passou: ${formatBRL(Math.abs(totals.diff))}`)
      else lines.push(`Diferença: 0 (bateu certinho)`)
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
                  {categoryName ? <span className="ml-2">• {categoryName}</span> : null}
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
              Nova negociação
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
                  ? 'Empreendimento: por enquanto, venda por unidade (entra em negociação).'
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
              <b>Empreendimento:</b> por enquanto, não marcamos “Vendido” no imóvel-base. Aqui você conduz a negociação e
              depois a venda será por <b>unidade</b>.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Valor referência</div>
              <div className="text-lg font-extrabold text-[var(--foreground)]">{formatCurrency(propertyValue)}</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">(usa venda/locação automaticamente)</div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Status comercial</div>
              <div className="text-lg font-extrabold text-[var(--foreground)]">
                {property?.deal_status ? (property.deal_status === 'sold' ? 'Vendido' : 'Reservado') : '—'}
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
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma negociação encontrada.</p>
          ) : (
            <div className="space-y-2">
              {negotiations.map((n) => {
                const title =
                  n.person?.full_name || n.person?.email || n.person?.phone_e164 || `Negociação ${n.id.slice(0, 6)}`
                return (
                  <div
                    key={n.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--foreground)]">{title}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{formatDate(n.created_at)}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{n.status || '—'}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => openProposalFromNegotiation(n)} disabled={!n.person_id}>
                        Montar proposta
                      </Button>

                      {n.lead_id ? (
                        <Link href={`/leads/${n.lead_id}`} className="text-xs font-medium text-[var(--primary)] hover:underline">
                          Abrir lead
                        </Link>
                      ) : n.person_id ? (
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

      {/* Modal - Nova negociação */}
      {newOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-black/10">
            <div className="p-4 border-b border-black/10 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-black/60">Negociação</div>
                <div className="text-lg font-extrabold text-black/90">Nova negociação</div>
                <div className="mt-1 text-sm text-black/60">
                  Cria/seleciona uma <b>Pessoa</b> e abre o “Montar proposta”.
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
                          {[person.email, person.phone_e164, person.document_id].filter(Boolean).join(' • ')}
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
                      {[selectedPerson.email, selectedPerson.phone_e164].filter(Boolean).join(' • ')}
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
                  {creatingNegotiation ? 'Criando...' : 'Criar negociação'}
                </Button>
              </div>
              <p className="text-xs text-black/60">Cadastre a pessoa e volte aqui para pesquisar.</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Proposta */}
      {proposalOpen && proposalEntity ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl bg-white shadow-xl border border-black/10">
            <div className="p-4 border-b border-black/10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-black/60">Proposta</div>
                <div className="text-lg font-extrabold text-black/90 truncate">{proposalEntity.title}</div>
                <div className="mt-1 text-sm text-black/60">
                  Valor do imóvel: <b>{formatCurrency(propertyValue)}</b>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    saveProposalDraftLocal(proposalEntity.person_id, proposalDraft)
                    setProposalOpen(false)
                    setProposalEntity(null)
                  }}
                >
                  Fechar
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Comissão */}
              <div className="rounded-2xl border border-black/10 p-4">
                <div>
                  <div className="text-sm font-extrabold text-black/90">Comissão</div>
                  <div className="text-sm text-black/60">Salva a comissão vinculada à negociação.</div>
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
                        value={Number.isFinite(commissionGross) ? commissionGross : 0}
                        onChange={(e) => setCommissionGross(parseFloat(e.target.value || '0'))}
                        className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>

                    <div>
                      <div className="text-xs text-black/60">% comissão</div>
                      <input
                        name="commissionPercent"
                        type="number"
                        step="0.01"
                        value={Number.isFinite(commissionPercent) ? commissionPercent : 0}
                        onChange={(e) => setCommissionPercent(parseFloat(e.target.value || '0'))}
                        className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>

                    <div className="md:col-span-3 flex items-center justify-end gap-2">
                      <Button type="submit" disabled={!canEditDeal}>
                        Salvar comissão
                      </Button>
                    </div>
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
                              onChange={(e) => {
                                const next = {
                                  ...proposalDraft,
                                  enabled: { ...(proposalDraft.enabled || {}), [k]: e.target.checked },
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
                              —
                            </Badge>
                          )}
                        </div>

                        <div className="mt-3">
                          <div className="text-xs text-black/60">Valor</div>
                          <input
                            type="number"
                            step="0.01"
                            disabled={!enabled}
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
                  <div className="text-xs text-black/60">Diferença</div>
                  <div className="text-2xl font-extrabold text-black/90">
                    {proposalTotals.target === null ? '—' : formatCurrency(Math.abs(proposalTotals.diff))}
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div className="rounded-2xl border border-black/10 p-4">
                <div className="text-sm font-extrabold text-black/90">Observações</div>
                <textarea
                  value={proposalDraft.notes || ''}
                  onChange={(e) => {
                    const next = { ...proposalDraft, notes: e.target.value }
                    setProposalDraft(next)
                    saveProposalDraftLocal(proposalEntity.person_id, next)
                  }}
                  className="mt-2 w-full min-h-[110px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Condições, prazos, itens inclusos, desconto aprovado, etc."
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    saveProposalDraftLocal(proposalEntity.person_id, proposalDraft)
                    setProposalOpen(false)
                    setProposalEntity(null)
                  }}
                >
                  Salvar rascunho e fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
