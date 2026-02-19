import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type NotificationPriority = 'high' | 'medium' | 'low'

type NotificationItem = {
  id: string
  kind: 'proposal_pending' | 'proposal_draft' | 'lead_new' | 'lead_followup'
  title: string
  message: string
  href: string
  created_at: string
  priority: NotificationPriority
  channels: Array<'app' | 'whatsapp_planned'>
}

const CLOSED_LEAD_STATUSES = new Set([
  'won',
  'lost',
  'closed',
  'converted',
  'archived',
  'cancelled',
  'finalizado',
  'finalized',
])

const PRIORITY_WEIGHT: Record<NotificationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

function toIso(input: unknown): string {
  if (typeof input === 'string' && input.trim()) return input
  return new Date().toISOString()
}

function formatBRL(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}

function normalizeLimit(raw: string | null): number {
  const parsed = Number(raw ?? 20)
  if (!Number.isFinite(parsed)) return 20
  return Math.max(5, Math.min(50, Math.floor(parsed)))
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const actor = user.id
    const limit = normalizeLimit(request.nextUrl.searchParams.get('limit'))
    const nowMs = Date.now()

    const [{ data: proposals, error: proposalsError }, { data: leads, error: leadsError }] = await Promise.all([
      supabase
        .from('property_proposals')
        .select(
          'id, title, status, property_id, negotiation_id, created_at, updated_at, created_by_profile_id, broker_seller_profile_id, broker_buyer_profile_id, commission_value'
        )
        .in('status', ['draft', 'in_review', 'counterproposal'])
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('leads')
        .select('id, title, client_name, status, created_at, updated_at, assigned_to, owner_user_id, created_by')
        .or(`assigned_to.eq.${actor},owner_user_id.eq.${actor},created_by.eq.${actor}`)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (proposalsError) {
      return NextResponse.json({ error: proposalsError.message }, { status: 400 })
    }

    let safeLeads: Array<Record<string, any>> = (leads ?? []) as Array<Record<string, any>>
    if (leadsError) {
      const fallback = await supabase
        .from('leads')
        .select('id, title, client_name, status, created_at, updated_at, assigned_to, created_by')
        .or(`assigned_to.eq.${actor},created_by.eq.${actor}`)
        .order('created_at', { ascending: false })
        .limit(50)
      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 400 })
      }
      safeLeads = fallback.data ?? []
    }

    const proposalRows = (proposals ?? []) as Array<{
      id: string
      title: string | null
      status: string | null
      property_id: string | null
      negotiation_id: string | null
      created_at: string | null
      updated_at: string | null
      created_by_profile_id: string | null
      broker_seller_profile_id: string | null
      broker_buyer_profile_id: string | null
      commission_value: number | null
    }>

    const proposalIds = proposalRows.map((row) => row.id).filter(Boolean)
    const propertyIds = Array.from(new Set(proposalRows.map((row) => row.property_id).filter(Boolean) as string[]))

    const [paymentsRes, propertiesRes] = await Promise.all([
      proposalIds.length > 0
        ? supabase.from('property_proposal_payments').select('proposal_id, amount').in('proposal_id', proposalIds)
        : Promise.resolve({ data: [], error: null } as any),
      propertyIds.length > 0
        ? supabase.from('properties').select('id, title').in('id', propertyIds)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    const proposalTotalById = new Map<string, number>()
    if (!paymentsRes.error) {
      const paymentRows = (paymentsRes.data ?? []) as Array<{ proposal_id: string; amount: number | null }>
      for (const row of paymentRows) {
        const amount = Number(row.amount ?? 0)
        if (!Number.isFinite(amount)) continue
        proposalTotalById.set(row.proposal_id, (proposalTotalById.get(row.proposal_id) ?? 0) + amount)
      }
    }

    const propertyTitleById = new Map<string, string>()
    if (!propertiesRes.error) {
      const rows = (propertiesRes.data ?? []) as Array<{ id: string; title: string | null }>
      for (const row of rows) {
        propertyTitleById.set(row.id, row.title?.trim() || `Imóvel ${row.id.slice(0, 8)}`)
      }
    }

    const items: NotificationItem[] = []

    for (const row of proposalRows) {
      const status = String(row.status ?? 'draft')
      const needsSellerAction = status === 'in_review' && row.broker_seller_profile_id === actor
      const needsBuyerAction = status === 'counterproposal' && row.broker_buyer_profile_id === actor
      const isOwnDraft = status === 'draft' && row.created_by_profile_id === actor

      if (!needsSellerAction && !needsBuyerAction && !isOwnDraft) continue

      const proposalShortId = row.id.slice(0, 8)
      const proposalTitle = row.title?.trim() || `Proposta ${proposalShortId}`
      const totalFromPayments = proposalTotalById.get(row.id)
      const fallbackTotal = Number(row.commission_value ?? 0)
      const total = Number.isFinite(totalFromPayments ?? NaN)
        ? Number(totalFromPayments)
        : Number.isFinite(fallbackTotal)
        ? fallbackTotal
        : null
      const totalLabel = formatBRL(total)
      const propertyTitle = row.property_id ? propertyTitleById.get(row.property_id) : null
      const isActionPending = needsSellerAction || needsBuyerAction
      const eventAt = toIso(row.updated_at ?? row.created_at)
      const eventStamp = Date.parse(eventAt)
      const stableEventId = Number.isFinite(eventStamp) ? String(eventStamp) : eventAt

      const messageParts = [
        isActionPending ? 'Acao pendente na proposta' : 'Rascunho de proposta salvo',
        proposalTitle,
        `(ID ${proposalShortId})`,
        totalLabel ? `Total ${totalLabel}` : null,
        propertyTitle ? `Imóvel: ${propertyTitle}` : null,
      ].filter(Boolean)

      items.push({
        id: `proposal-${row.id}-${stableEventId}`,
        kind: isActionPending ? 'proposal_pending' : 'proposal_draft',
        title: isActionPending ? 'Proposta aguardando resposta' : 'Proposta em rascunho',
        message: messageParts.join(' - '),
        href:
          row.property_id && row.negotiation_id
            ? `/properties/${row.property_id}?tab=negociacoes&negotiationId=${row.negotiation_id}&proposalId=${row.id}`
            : row.property_id
            ? `/properties/${row.property_id}?tab=negociacoes`
            : '/properties',
        created_at: eventAt,
        priority: isActionPending ? 'high' : 'medium',
        channels: ['app', 'whatsapp_planned'],
      })
    }

    const leadRows = (safeLeads ?? []) as Array<{
      id: string
      title: string | null
      client_name?: string | null
      status?: string | null
      created_at?: string | null
      updated_at?: string | null
    }>

    const freshWindowMs = 1000 * 60 * 60 * 36
    const followupWindowMs = 1000 * 60 * 60 * 24 * 3

    for (const row of leadRows) {
      const status = String(row.status ?? 'open').toLowerCase()
      if (CLOSED_LEAD_STATUSES.has(status)) continue

      const createdAt = Date.parse(String(row.created_at ?? ''))
      const updatedAt = Date.parse(String(row.updated_at ?? row.created_at ?? ''))
      const createdDelta = Number.isFinite(createdAt) ? nowMs - createdAt : Number.POSITIVE_INFINITY
      const updatedDelta = Number.isFinite(updatedAt) ? nowMs - updatedAt : Number.POSITIVE_INFINITY
      const isNewLead = createdDelta <= freshWindowMs
      const needsFollowup = updatedDelta >= followupWindowMs

      if (!isNewLead && !needsFollowup) continue

      const leadTitle = row.title?.trim() || row.client_name?.trim() || `Lead ${row.id.slice(0, 8)}`
      const eventAt = toIso(isNewLead ? row.created_at : row.updated_at ?? row.created_at)
      const eventStamp = Date.parse(eventAt)
      const stableEventId = Number.isFinite(eventStamp) ? String(eventStamp) : eventAt

      items.push({
        id: `lead-${row.id}-${isNewLead ? 'new' : 'followup'}-${stableEventId}`,
        kind: isNewLead ? 'lead_new' : 'lead_followup',
        title: isNewLead ? 'Novo lead para atender' : 'Lead sem atualização recente',
        message: isNewLead
          ? `${leadTitle} (ID ${row.id.slice(0, 8)})`
          : `${leadTitle} (ID ${row.id.slice(0, 8)}) precisa de retorno`,
        href: `/leads/${row.id}`,
        created_at: eventAt,
        priority: isNewLead ? 'medium' : 'high',
        channels: ['app', 'whatsapp_planned'],
      })
    }

    items.sort((a, b) => {
      const byPriority = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      if (byPriority !== 0) return byPriority
      return Date.parse(b.created_at) - Date.parse(a.created_at)
    })

    const trimmed = items.slice(0, limit)

    return NextResponse.json(
      {
        items: trimmed,
        channels: {
          app: { enabled: true },
          whatsapp: {
            enabled: false,
            status: 'planned',
            note: 'Canal previsto. Integração com automações/IA será ligada em etapa futura.',
          },
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno ao carregar notificações.' }, { status: 500 })
  }
}
