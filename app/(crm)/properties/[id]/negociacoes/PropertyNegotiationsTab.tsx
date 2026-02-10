'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { getPropertyLeads } from '../actions'

type LeadRow = {
  id: string
  title?: string | null
  status?: string | null
  value_estimate?: number | null
  created_at?: string | null
  stage_id?: string | null
  person_id?: string | null
  name?: string | null
  phone_e164?: string | null
  email?: string | null
}

type PropertyRow = {
  id: string
  title: string | null
  purpose: string | null
  price: number | null
  rent_price: number | null
  property_category_id: string | null
  // relacionamento (se existir no select)
  property_categories?: { name: string | null } | { name: string | null }[] | null
  // novos campos
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

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function addDaysISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function isEmpreendimentoByCategoryName(name?: string | null) {
  if (!name) return false
  const n = name.toLowerCase()
  return n.includes('empreendimento') || n.includes('incorpora') || n.includes('lançamento') || n.includes('lancamento')
}

type DraftProposal = {
  enabled: Partial<Record<PaymentKey, boolean>>
  amounts: Partial<Record<PaymentKey, number>>
  notes?: string
}

const draftKey = (propertyId: string, leadId: string) => `vitrya:proposal:${propertyId}:${leadId}`

export default function PropertyNegotiationsTab({ propertyId }: { propertyId: string }) {
  const [property, setProperty] = useState<PropertyRow | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingDeal, setSavingDeal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal proposta
  const [proposalOpen, setProposalOpen] = useState(false)
  const [proposalLead, setProposalLead] = useState<LeadRow | null>(null)
  const [proposalDraft, setProposalDraft] = useState<DraftProposal>({
    enabled: { cash: true },
    amounts: { cash: 0 },
    notes: '',
  })

  const categoryName = useMemo(() => {
    const rel = property?.property_categories as any
    if (!rel) return null
    if (Array.isArray(rel)) return rel?.[0]?.name ?? null
    return rel?.name ?? null
  }, [property?.property_categories])

  const isEmpreendimento = useMemo(() => isEmpreendimentoByCategoryName(categoryName ?? null), [categoryName])

  const propertyValue = useMemo(() => {
    // regra simples: se for venda, usa price; se for locação, usa rent_price
    // se purpose vier vazio, cai no price.
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

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    async function loadAll() {
      try {
        // 1) property
        const { data: prop, error: propErr } = await supabase
          .from('properties')
          .select(
            `
            id,
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
        if (active) setProperty((prop as any) ?? null)

        // 2) leads vinculados
        const leadsData = await getPropertyLeads(propertyId)
        if (active) setLeads((leadsData as LeadRow[]) ?? [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar negociações.'
        if (active) setError(message)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAll()

    return () => {
      active = false
    }
  }, [propertyId])

  async function setDealStatus(next: 'reserved' | 'sold' | null) {
    if (!property) return
    setSavingDeal(true)
    setError(null)

    try {
      const patch: any = {
        deal_status: next,
        deal_marked_at: next ? new Date().toISOString() : null,
        deal_visible_until: null,
      }

      // ✅ regra: vendida aparece 7 dias na vitrine
      if (next === 'sold') {
        patch.deal_visible_until = addDaysISO(7)
      }

      const { data, error: upErr } = await supabase
        .from('properties')
        .update(patch)
        .eq('id', property.id)
        .select(
          `
          id,
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
        .single()

      if (upErr) throw upErr
      setProperty(data as any)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível atualizar o status comercial.'
      setError(message)
    } finally {
      setSavingDeal(false)
    }
  }

  function openProposal(lead: LeadRow) {
    setProposalLead(lead)

    // tenta recuperar rascunho salvo localmente (rápido pra produção agora)
    try {
      const raw = localStorage.getItem(draftKey(propertyId, lead.id))
      if (raw) {
        const parsed = JSON.parse(raw) as DraftProposal
        setProposalDraft({
          enabled: parsed.enabled || {},
          amounts: parsed.amounts || {},
          notes: parsed.notes || '',
        })
      } else {
        setProposalDraft({
          enabled: { cash: true },
          amounts: { cash: 0 },
          notes: '',
        })
      }
    } catch {
      setProposalDraft({
        enabled: { cash: true },
        amounts: { cash: 0 },
        notes: '',
      })
    }

    setProposalOpen(true)
  }

  function saveProposalDraftLocal(leadId: string, draft: DraftProposal) {
    try {
      localStorage.setItem(draftKey(propertyId, leadId), JSON.stringify(draft))
    } catch {
      // ignore
    }
  }

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
    const discount = total - target

    return {
      total,
      target: propertyValue ?? null,
      diff, // >0 falta, <0 passou
      discount, // >0 passou do valor
    }
  }, [proposalDraft, propertyValue])

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
                <>Imóvel {propertyId.slice(0, 8)}</>
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

          {/* Ações Reservado/Vendido */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              disabled={savingDeal}
              onClick={() => setDealStatus(null)}
              title="Voltar para sem status comercial"
            >
              Limpar
            </Button>

            <Button
              variant="outline"
              disabled={savingDeal}
              onClick={() => setDealStatus('reserved')}
              title="Marca como reservado (continua na vitrine)"
            >
              Reservado
            </Button>

            <Button
              disabled={savingDeal || isEmpreendimento}
              onClick={() => setDealStatus('sold')}
              title={
                isEmpreendimento
                  ? 'Empreendimento: por enquanto, venda por unidade (entra em negociação).'
                  : 'Marca como vendido (fica 7 dias na vitrine e depois some)'
              }
            >
              Vendido
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}

          {/* Aviso simples de empreendimento */}
          {isEmpreendimento ? (
            <div className="rounded-[var(--radius)] border border-black/10 bg-black/5 p-3 text-sm text-black/70">
              <b>Empreendimento:</b> por enquanto, não marcamos “Vendido” no imóvel-base.
              Aqui você vai conduzir a negociação e depois (quando entrar o módulo de unidades/estoque)
              a venda será por <b>unidade</b>.
            </div>
          ) : null}

          {/* Resumo do valor do imóvel */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Valor referência</div>
              <div className="text-lg font-extrabold text-[var(--foreground)]">
                {formatCurrency(propertyValue)}
              </div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                (usa venda/locação automaticamente)
              </div>
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
              <div className="text-sm font-semibold text-[var(--foreground)]">
                Vendido fica 7 dias na vitrine
              </div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                Depois some automaticamente (pela VIEW pública).
              </div>
            </div>
          </div>

          {/* Lista de leads/negociações */}
          {leads.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma negociação encontrada.</p>
          ) : (
            <div className="space-y-2">
              {leads.map((lead) => {
                const title =
                  lead.title ||
                  lead.name ||
                  lead.email ||
                  lead.phone_e164 ||
                  `Lead ${lead.id.slice(0, 6)}`

                return (
                  <div
                    key={lead.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--foreground)]">{title}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{formatDate(lead.created_at)}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-[var(--muted-foreground)]">{lead.status || '—'}</p>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {formatCurrency(lead.value_estimate)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => openProposal(lead)}>
                        Montar proposta
                      </Button>

                      <Link
                        href={`/leads/${lead.id}`}
                        className="text-xs font-medium text-[var(--primary)] hover:underline"
                      >
                        Abrir lead
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Proposta (simples e rápido agora) */}
      {proposalOpen && proposalLead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl bg-white shadow-xl border border-black/10">
            <div className="p-4 border-b border-black/10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-black/60">Proposta</div>
                <div className="text-lg font-extrabold text-black/90 truncate">
                  {proposalLead.title || proposalLead.name || proposalLead.email || proposalLead.phone_e164 || proposalLead.id.slice(0, 6)}
                </div>
                <div className="mt-1 text-sm text-black/60">
                  Valor do imóvel: <b>{formatCurrency(propertyValue)}</b>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    saveProposalDraftLocal(proposalLead.id, proposalDraft)
                    setProposalOpen(false)
                    setProposalLead(null)
                  }}
                >
                  Fechar
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="rounded-2xl border border-black/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold text-black/90">Formas de pagamento</div>
                    <div className="text-sm text-black/60">Selecione uma ou várias e preencha valores.</div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => {
                      const text = buildProposalSummaryText(property, proposalLead, proposalDraft, proposalTotals)
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
                                saveProposalDraftLocal(proposalLead.id, next)
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
                              saveProposalDraftLocal(proposalLead.id, next)
                            }}
                            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/5"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Resumo */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs text-black/60">Total da proposta</div>
                  <div className="text-2xl font-extrabold text-black/90">
                    {formatCurrency(proposalTotals.total)}
                  </div>
                </div>

                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs text-black/60">Valor do imóvel</div>
                  <div className="text-2xl font-extrabold text-black/90">
                    {formatCurrency(proposalTotals.target)}
                  </div>
                </div>

                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-xs text-black/60">Diferença</div>
                  <div className="text-2xl font-extrabold text-black/90">
                    {proposalTotals.target === null ? '—' : formatCurrency(Math.abs(proposalTotals.diff))}
                  </div>
                  {proposalTotals.target !== null ? (
                    <div className="mt-1 text-sm text-black/70">
                      {proposalTotals.diff > 0 ? (
                        <>Faltam <b>{formatCurrency(proposalTotals.diff)}</b> para fechar</>
                      ) : proposalTotals.diff < 0 ? (
                        <>Passou <b>{formatCurrency(Math.abs(proposalTotals.diff))}</b> do valor</>
                      ) : (
                        <>Bateu certinho 🎯</>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 p-4">
                <div className="text-sm font-extrabold text-black/90">Observações</div>
                <textarea
                  value={proposalDraft.notes || ''}
                  onChange={(e) => {
                    const next = { ...proposalDraft, notes: e.target.value }
                    setProposalDraft(next)
                    saveProposalDraftLocal(proposalLead.id, next)
                  }}
                  className="mt-2 w-full min-h-[110px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Condições, prazos, itens inclusos, desconto aprovado, etc."
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    // “salvar” rápido por enquanto (local), sem mexer em schema agora
                    saveProposalDraftLocal(proposalLead.id, proposalDraft)
                    setProposalOpen(false)
                    setProposalLead(null)
                  }}
                >
                  Salvar rascunho e fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function buildProposalSummaryText(
  property: PropertyRow | null,
  lead: LeadRow,
  draft: { enabled?: any; amounts?: any; notes?: string },
  totals: { total: number; target: number | null; diff: number }
) {
  const title =
    lead.title || lead.name || lead.email || lead.phone_e164 || `Lead ${lead.id.slice(0, 6)}`
  const propTitle = property?.title || `Imóvel ${property?.id?.slice(0, 8) || ''}`

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

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
