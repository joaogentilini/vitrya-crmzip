export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'
import { ensureUserProfile } from '@/lib/auth'

interface Profile {
  id: string
  full_name: string | null
}

type LeadRow = {
  id: string
  title: string
  status: string | null
  stage_id: string | null
  pipeline_id: string | null
  lead_source_id: string | null
  lead_interest_id: string | null
  lead_source_name?: string | null
  lead_interest_name?: string | null
  assigned_to: string | null
  created_at: string
}

type TaskRow = {
  id: string
  lead_id: string
  title: string
  type: string
  due_at: string | null
  status: string
  assigned_to: string | null
}

type PipelineRow = {
  id: string
  name: string
  created_at: string
}

type PipelineStageRow = {
  id: string
  pipeline_id: string
  name: string
  position: number
}

type CampaignTaskRow = {
  id: string
  property_id: string
  title: string
  due_date: string
  done_at: string | null
}

type ProposalRow = {
  id: string
  negotiation_id: string | null
  status: string | null
  title: string | null
  total_value: number | string | null
  commission_percent: number | string | null
  commission_value: number | string | null
  broker_commission_value: number | string | null
  base_value: number | string | null
  owner_net_value: number | string | null
  property_id: string | null
  created_at: string | null
  updated_at: string | null
  approved_at: string | null
}

type PropertyRow = {
  id: string
  title: string | null
  status: string | null
  purpose: string | null
  price: number | string | null
  rent_price: number | string | null
  city: string | null
  created_at: string
  deal_status: string | null
}

type PaymentRow = {
  amount: number | string | null
  status: string | null
  received_at: string | null
  expected_at: string | null
  created_at: string | null
}

type CampaignMetrics = {
  tasksTotal: number
  doneTotal: number
  pending: number
  overdue: number
  dueToday: number
  dueWeek: number
  pct: number
}

type FunnelStageRow = {
  id: string
  name: string
  position: number
  count: number
  fromFirstPct: number
  fromPreviousPct: number
}

type ProposalSummaryRow = {
  id: string
  negotiationId: string | null
  title: string | null
  propertyTitle: string | null
  status: string | null
  totalValue: number
  updatedAt: string | null
  propertyId: string | null
}

type CatalogRow = {
  id: string
  name: string | null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isReceivedStatus(value: unknown): boolean {
  const normalized = String(value ?? '').toLowerCase()
  return normalized === 'received' || normalized === 'paid' || normalized === 'settled'
}

function isMissingRelationError(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('relation') && message.includes('does not exist')
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isSalePurpose(value: unknown): boolean {
  const normalized = normalizeText(value)
  return normalized.includes('venda') || normalized.includes('sale')
}

function isRentPurpose(value: unknown): boolean {
  const normalized = normalizeText(value)
  return normalized.includes('alug') || normalized.includes('rent') || normalized.includes('loca')
}

function isActivePropertyStatus(value: unknown): boolean {
  const normalized = normalizeText(value)
  return normalized === 'active' || normalized === 'published' || normalized === 'ativo' || normalized === 'disponivel'
}

async function getDashboardData(userId: string, isManager: boolean, filterUserId?: string) {
  const supabase = await createClient()
  const targetUserId = isManager && filterUserId ? filterUserId : isManager ? null : userId

  let leadsQuery = supabase
    .from('leads')
    .select('id, title, status, stage_id, pipeline_id, lead_source_id, lead_interest_id, assigned_to, created_at')

  if (targetUserId) {
    leadsQuery = leadsQuery.or(`created_by.eq.${targetUserId},assigned_to.eq.${targetUserId}`)
  }

  let tasksQuery = supabase
    .from('tasks')
    .select('id, lead_id, title, type, due_at, status, assigned_to')
    .eq('status', 'open')

  if (targetUserId) {
    tasksQuery = tasksQuery.or(`assigned_to.eq.${targetUserId},created_by.eq.${targetUserId}`)
  }

  let proposalsQuery = supabase
    .from('property_proposals')
    .select(
      'id, negotiation_id, status, title, total_value, commission_percent, commission_value, broker_commission_value, base_value, owner_net_value, property_id, created_at, updated_at, approved_at'
    )
    .order('updated_at', { ascending: false })
    .limit(2000)

  if (targetUserId) {
    proposalsQuery = proposalsQuery.or(
      `broker_seller_profile_id.eq.${targetUserId},broker_buyer_profile_id.eq.${targetUserId}`
    )
  }

  let propertiesQuery = supabase
    .from('properties')
    .select('id, title, status, purpose, price, rent_price, city, created_at, deal_status')
    .order('created_at', { ascending: false })
    .limit(4000)

  if (targetUserId) {
    propertiesQuery = propertiesQuery.eq('owner_user_id', targetUserId)
  }

  const ownerPropertyIdsQuery = targetUserId
    ? supabase.from('properties').select('id').eq('owner_user_id', targetUserId).limit(4000)
    : Promise.resolve({ data: null, error: null } as any)

  const [
    leadsResult,
    tasksResult,
    pipelinesResult,
    stagesResult,
    leadSourcesResult,
    leadInterestsResult,
    proposalsResult,
    propertiesResult,
    ownerPropertyIdsResult,
  ] = await Promise.all([
    leadsQuery,
    tasksQuery,
    supabase.from('pipelines').select('id, name, created_at').order('created_at', { ascending: true }),
    supabase.from('pipeline_stages').select('id, pipeline_id, name, position').order('position', { ascending: true }),
    supabase.from('lead_sources').select('id, name'),
    supabase.from('lead_interests').select('id, name'),
    proposalsQuery,
    propertiesQuery,
    ownerPropertyIdsQuery,
  ])

  const sourceNameById = new Map(
    ((leadSourcesResult.data ?? []) as CatalogRow[])
      .filter((row) => !!row.id)
      .map((row) => [row.id, row.name ?? null])
  )
  const interestNameById = new Map(
    ((leadInterestsResult.data ?? []) as CatalogRow[])
      .filter((row) => !!row.id)
      .map((row) => [row.id, row.name ?? null])
  )

  const leads = ((leadsResult.data ?? []) as LeadRow[])
    .filter((row) => !!row.id)
    .map((row) => ({
      ...row,
      lead_source_name: row.lead_source_id ? sourceNameById.get(row.lead_source_id) ?? null : null,
      lead_interest_name: row.lead_interest_id ? interestNameById.get(row.lead_interest_id) ?? null : null,
    }))
  const tasks = ((tasksResult.data ?? []) as TaskRow[]).filter((row) => !!row.id && !!row.lead_id)
  const pipelines = ((pipelinesResult.data ?? []) as PipelineRow[]).filter((row) => !!row.id)
  const stages = ((stagesResult.data ?? []) as PipelineStageRow[]).filter((row) => !!row.id)
  const proposals = ((proposalsResult.data ?? []) as ProposalRow[]).filter((row) => !!row.id)
  const properties = ((propertiesResult.data ?? []) as PropertyRow[]).filter((row) => !!row.id)
  const ownerPropertyIds = targetUserId
    ? ((ownerPropertyIdsResult.data ?? []) as Array<{ id: string }>).map((row) => row.id).filter(Boolean)
    : null

  const proposalPropertyIds = Array.from(
    new Set(
      proposals
        .map((proposal) => proposal.property_id)
        .filter((propertyId): propertyId is string => typeof propertyId === 'string' && propertyId.length > 0)
    )
  )

  const proposalPropertiesRes =
    proposalPropertyIds.length > 0
      ? await supabase.from('properties').select('id, title').in('id', proposalPropertyIds)
      : { data: [], error: null }

  const proposalPropertyTitleById = new Map<string, string | null>(
    ((proposalPropertiesRes.data ?? []) as Array<{ id: string; title: string | null }>)
      .filter((row) => !!row.id)
      .map((row) => [row.id, row.title ?? null])
  )

  for (const property of properties) {
    if (!property.id || proposalPropertyTitleById.has(property.id)) continue
    proposalPropertyTitleById.set(property.id, property.title ?? null)
  }

  const now = new Date()
  const todayYMD = now.toISOString().slice(0, 10)
  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndYMD = weekEnd.toISOString().slice(0, 10)

  let campaignMetrics: CampaignMetrics = {
    tasksTotal: 0,
    doneTotal: 0,
    pending: 0,
    overdue: 0,
    dueToday: 0,
    dueWeek: 0,
    pct: 0,
  }
  let upcomingCampaignTasks: CampaignTaskRow[] = []
  let upcomingCampaignTasksTotal = 0
  let propertyMap: Record<string, { title: string | null; city: string | null; neighborhood: string | null }> = {}

  const canQueryCampaigns = !targetUserId || (ownerPropertyIds && ownerPropertyIds.length > 0)
  if (canQueryCampaigns) {
    let campaignMetricsQuery = supabase
      .from('property_campaign_tasks')
      .select('property_id, due_date, done_at')

    let upcomingCampaignTotalQuery = supabase
      .from('property_campaign_tasks')
      .select('id', { count: 'exact', head: true })
      .is('done_at', null)

    let upcomingCampaignTasksQuery = supabase
      .from('property_campaign_tasks')
      .select('id, property_id, title, due_date, done_at')
      .is('done_at', null)
      .order('due_date', { ascending: true })
      .limit(3)

    if (targetUserId && ownerPropertyIds) {
      campaignMetricsQuery = campaignMetricsQuery.in('property_id', ownerPropertyIds)
      upcomingCampaignTotalQuery = upcomingCampaignTotalQuery.in('property_id', ownerPropertyIds)
      upcomingCampaignTasksQuery = upcomingCampaignTasksQuery.in('property_id', ownerPropertyIds)
    }

    const [campaignMetricsResult, upcomingCampaignTotalResult, upcomingCampaignTasksResult] = await Promise.all([
      campaignMetricsQuery,
      upcomingCampaignTotalQuery,
      upcomingCampaignTasksQuery,
    ])

    const campaignTasks = (campaignMetricsResult.data ?? []) as Array<{
      property_id: string
      due_date: string
      done_at: string | null
    }>

    upcomingCampaignTasks = (upcomingCampaignTasksResult.data ?? []) as CampaignTaskRow[]
    upcomingCampaignTasksTotal = upcomingCampaignTotalResult.count ?? 0

    for (const task of campaignTasks) {
      campaignMetrics.tasksTotal += 1

      if (task.done_at) {
        campaignMetrics.doneTotal += 1
        continue
      }

      campaignMetrics.pending += 1
      const dueYMD = String(task.due_date ?? '').slice(0, 10)
      if (!dueYMD) continue

      if (dueYMD < todayYMD) campaignMetrics.overdue += 1
      else if (dueYMD === todayYMD) campaignMetrics.dueToday += 1
      else if (dueYMD <= weekEndYMD) campaignMetrics.dueWeek += 1
    }

    campaignMetrics.pct =
      campaignMetrics.tasksTotal > 0
        ? Math.round((campaignMetrics.doneTotal / campaignMetrics.tasksTotal) * 100)
        : 0

    if (upcomingCampaignTasks.length > 0) {
      const propertyIds = [...new Set(upcomingCampaignTasks.map((task) => task.property_id).filter(Boolean))]
      if (propertyIds.length > 0) {
        const { data: propertiesForTasks } = await supabase
          .from('properties')
          .select('id, title, city, neighborhood')
          .in('id', propertyIds)

        propertyMap = (
          (propertiesForTasks ?? []) as Array<{
            id: string
            title: string | null
            city: string | null
            neighborhood: string | null
          }>
        ).reduce(
          (acc, property) => {
            acc[property.id] = {
              title: property.title ?? null,
              city: property.city ?? null,
              neighborhood: property.neighborhood ?? null,
            }
            return acc
          },
          {} as Record<string, { title: string | null; city: string | null; neighborhood: string | null }>
        )
      }
    }
  }

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 999)

  const leadsWithOpenTask = new Set(tasks.map((task) => task.lead_id))
  const leadsWithoutAction = leads.filter((lead) => !leadsWithOpenTask.has(lead.id))

  const overdueTasks = tasks.filter((task) => {
    const dueDate = parseDate(task.due_at)
    return dueDate ? dueDate.getTime() < now.getTime() : false
  })
  const overdueLeadIds = new Set(overdueTasks.map((task) => task.lead_id))
  const overdueLeads = leads.filter((lead) => overdueLeadIds.has(lead.id))

  const upcomingTasks = tasks.filter((task) => {
    const dueDate = parseDate(task.due_at)
    if (!dueDate) return false
    return dueDate.getTime() >= now.getTime() && dueDate.getTime() <= tomorrow.getTime()
  })

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const todayTasks = tasks
    .filter((task) => {
      const dueDate = parseDate(task.due_at)
      if (!dueDate) return false
      return dueDate.getTime() >= todayStart.getTime() && dueDate.getTime() <= todayEnd.getTime()
    })
    .sort((a, b) => {
      const aDate = parseDate(a.due_at)?.getTime() ?? 0
      const bDate = parseDate(b.due_at)?.getTime() ?? 0
      return aDate - bDate
    })

  const wonLeads = leads.filter((lead) => normalizeText(lead.status) === 'won')
  const lostLeads = leads.filter((lead) => normalizeText(lead.status) === 'lost')

  const pipelineCounts = new Map<string, number>()
  for (const lead of leads) {
    if (!lead.pipeline_id || !lead.stage_id) continue
    pipelineCounts.set(lead.pipeline_id, (pipelineCounts.get(lead.pipeline_id) ?? 0) + 1)
  }

  let primaryPipelineId: string | null = pipelines[0]?.id ?? null
  if (pipelineCounts.size > 0) {
    const [first] = [...pipelineCounts.entries()].sort((a, b) => b[1] - a[1])
    primaryPipelineId = first?.[0] ?? primaryPipelineId
  }

  const selectedPipeline = primaryPipelineId ? pipelines.find((pipeline) => pipeline.id === primaryPipelineId) : null
  const selectedStages = primaryPipelineId
    ? stages
        .filter((stage) => stage.pipeline_id === primaryPipelineId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    : []

  const leadCountByStage = new Map<string, number>()
  for (const lead of leads) {
    if (!primaryPipelineId || lead.pipeline_id !== primaryPipelineId || !lead.stage_id) continue
    leadCountByStage.set(lead.stage_id, (leadCountByStage.get(lead.stage_id) ?? 0) + 1)
  }

  const firstStageCount = selectedStages.length > 0 ? leadCountByStage.get(selectedStages[0].id) ?? 0 : 0
  let previousStageCount = firstStageCount

  const funnelStages: FunnelStageRow[] = selectedStages.map((stage, index) => {
    const currentCount = leadCountByStage.get(stage.id) ?? 0
    const fromFirstPct =
      firstStageCount > 0 ? Math.round((currentCount / firstStageCount) * 100) : currentCount > 0 ? 100 : 0
    const fromPreviousPct =
      index === 0
        ? currentCount > 0
          ? 100
          : 0
        : previousStageCount > 0
        ? Math.round((currentCount / previousStageCount) * 100)
        : currentCount > 0
        ? 100
        : 0

    previousStageCount = currentCount

    return {
      id: stage.id,
      name: stage.name ?? `Etapa ${index + 1}`,
      position: stage.position ?? index,
      count: currentCount,
      fromFirstPct,
      fromPreviousPct,
    }
  })

  const proposalStatus = {
    draft: 0,
    inReview: 0,
    counterproposal: 0,
    approved: 0,
    rejected: 0,
    other: 0,
  }

  const recentProposals: ProposalSummaryRow[] = []
  let approvedSalesCount = 0
  let approvedSalesValue = 0
  let totalCommissionPortfolio = 0
  let avgCommissionPercentAccumulator = 0
  let avgCommissionPercentCount = 0

  for (const proposal of proposals) {
    const status = normalizeText(proposal.status || 'draft')
    const commissionValue =
      toFiniteNumber(proposal.broker_commission_value) ?? toFiniteNumber(proposal.commission_value) ?? 0
    const totalValueRaw = toFiniteNumber(proposal.total_value)
    const baseValueRaw = toFiniteNumber(proposal.base_value)
    const ownerNetRaw = toFiniteNumber(proposal.owner_net_value)
    const totalValue = totalValueRaw ?? baseValueRaw ?? (ownerNetRaw !== null ? ownerNetRaw + commissionValue : 0)

    switch (status) {
      case 'draft':
        proposalStatus.draft += 1
        break
      case 'in_review':
        proposalStatus.inReview += 1
        break
      case 'counterproposal':
        proposalStatus.counterproposal += 1
        break
      case 'approved':
        proposalStatus.approved += 1
        break
      case 'rejected':
        proposalStatus.rejected += 1
        break
      default:
        proposalStatus.other += 1
        break
    }

    if (status === 'approved') {
      approvedSalesCount += 1
      approvedSalesValue += Math.max(totalValue, 0)
      totalCommissionPortfolio += Math.max(commissionValue, 0)

      const percent =
        toFiniteNumber(proposal.commission_percent) ?? (totalValue > 0 ? (commissionValue / totalValue) * 100 : null)
      if (percent !== null && Number.isFinite(percent)) {
        avgCommissionPercentAccumulator += Math.max(percent, 0)
        avgCommissionPercentCount += 1
      }
    }

    if (recentProposals.length < 8) {
      recentProposals.push({
        id: proposal.id,
        negotiationId: proposal.negotiation_id ?? null,
        title: proposal.title ?? null,
        propertyTitle: proposal.property_id ? proposalPropertyTitleById.get(proposal.property_id) ?? null : null,
        status: proposal.status ?? null,
        totalValue: Math.max(totalValue, 0),
        updatedAt: proposal.updated_at ?? proposal.created_at ?? null,
        propertyId: proposal.property_id ?? null,
      })
    }
  }

  const approvedAverageTicket = approvedSalesCount > 0 ? approvedSalesValue / approvedSalesCount : 0

  const paymentWindowStart = new Date(now)
  paymentWindowStart.setDate(paymentWindowStart.getDate() - 30)

  let paymentsTableAvailable = true
  let commissionReceivedInterval = 0
  let commissionReceivedAll = 0
  let commissionPending = Math.max(totalCommissionPortfolio, 0)

  let paymentsQuery = supabase
    .from('broker_commission_payments')
    .select('amount, status, received_at, expected_at, created_at')
    .limit(5000)

  if (targetUserId) {
    paymentsQuery = paymentsQuery.eq('broker_profile_id', targetUserId)
  }

  const { data: paymentsData, error: paymentsError } = await paymentsQuery
  if (paymentsError) {
    if (isMissingRelationError(paymentsError)) {
      paymentsTableAvailable = false
    } else {
      throw new Error(paymentsError.message || 'Erro ao carregar pagamentos de comissão.')
    }
  } else {
    const paymentRows = (paymentsData ?? []) as PaymentRow[]
    let pendingFromPayments = 0

    for (const row of paymentRows) {
      const amount = Math.max(toFiniteNumber(row.amount) ?? 0, 0)
      const receivedAt = parseDate(row.received_at)
      const fallbackAt = parseDate(row.expected_at) ?? parseDate(row.created_at)
      const effectiveDate = receivedAt ?? fallbackAt

      if (isReceivedStatus(row.status)) {
        commissionReceivedAll += amount
        if (
          effectiveDate &&
          effectiveDate.getTime() >= paymentWindowStart.getTime() &&
          effectiveDate.getTime() <= now.getTime()
        ) {
          commissionReceivedInterval += amount
        }
      } else {
        pendingFromPayments += amount
      }
    }

    commissionPending = Math.max(pendingFromPayments, 0)
  }

  const totalProperties = properties.length
  let activeProperties = 0
  let saleProperties = 0
  let rentProperties = 0
  let reservedProperties = 0
  let soldProperties = 0
  const salePrices: number[] = []
  const rentPrices: number[] = []

  for (const property of properties) {
    if (isActivePropertyStatus(property.status)) activeProperties += 1
    if (isSalePurpose(property.purpose)) saleProperties += 1
    if (isRentPurpose(property.purpose)) rentProperties += 1

    const dealStatus = normalizeText(property.deal_status)
    if (dealStatus === 'reserved') reservedProperties += 1
    if (dealStatus === 'sold') soldProperties += 1

    const salePrice = toFiniteNumber(property.price)
    if (salePrice !== null && salePrice > 0) salePrices.push(salePrice)

    const rentPrice = toFiniteNumber(property.rent_price)
    if (rentPrice !== null && rentPrice > 0) rentPrices.push(rentPrice)
  }

  const avgSalePrice = salePrices.length > 0 ? salePrices.reduce((acc, value) => acc + value, 0) / salePrices.length : 0
  const avgRentPrice = rentPrices.length > 0 ? rentPrices.reduce((acc, value) => acc + value, 0) / rentPrices.length : 0

  return {
    totalLeads: leads.length,
    leadsWithoutAction: leadsWithoutAction.slice(0, 10),
    leadsWithoutActionCount: leadsWithoutAction.length,
    overdueLeads: overdueLeads.slice(0, 10),
    overdueLeadsCount: overdueLeads.length,
    upcomingTasksCount: upcomingTasks.length,
    todayTasks: todayTasks.slice(0, 10),
    wonCount: wonLeads.length,
    lostCount: lostLeads.length,
    leads,
    campaignMetrics,
    upcomingCampaignTasks,
    upcomingCampaignTasksTotal,
    propertyMap,
    leadsFunnel: {
      pipelineId: selectedPipeline?.id ?? null,
      pipelineName: selectedPipeline?.name ?? null,
      stages: funnelStages,
      openCount: leads.filter((lead) => {
        const status = normalizeText(lead.status)
        return status !== 'won' && status !== 'lost'
      }).length,
      wonCount: wonLeads.length,
      lostCount: lostLeads.length,
      winRatePct: leads.length > 0 ? Math.round((wonLeads.length / leads.length) * 100) : 0,
      lossRatePct: leads.length > 0 ? Math.round((lostLeads.length / leads.length) * 100) : 0,
    },
    dealsSummary: {
      totalProposals: proposals.length,
      draftCount: proposalStatus.draft,
      inReviewCount: proposalStatus.inReview,
      counterproposalCount: proposalStatus.counterproposal,
      approvedCount: proposalStatus.approved,
      rejectedCount: proposalStatus.rejected,
      otherCount: proposalStatus.other,
      approvedSalesValue,
      approvedAverageTicket,
      recentProposals,
    },
    financialSummary: {
      commissionPortfolio: totalCommissionPortfolio,
      commissionReceivedInterval,
      commissionPending,
      approvedSalesCount,
      approvedSalesValue,
      averageCommissionPercent:
        avgCommissionPercentCount > 0 ? avgCommissionPercentAccumulator / avgCommissionPercentCount : 0,
      paymentsTableAvailable,
      periodDays: 30,
    },
    propertiesSummary: {
      totalProperties,
      activeProperties,
      saleProperties,
      rentProperties,
      reservedProperties,
      soldProperties,
      avgSalePrice,
      avgRentPrice,
      recentProperties: properties.slice(0, 8),
    },
  }
}

async function getProfiles() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name', { ascending: true })
  return data || []
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ broker?: string }>
}) {
  const sp = (await searchParams) ?? {}
  const broker = sp.broker

  const profile = await ensureUserProfile()
  if (!profile) redirect('/')

  if (profile && (profile as any).is_active === false) {
    redirect('/blocked')
  }

  const userId = (profile as any).id
  const role = String((profile as any).role ?? '')
  const isManager = role === 'admin' || role === 'gestor'

  const [dashboardData, profiles] = await Promise.all([
    getDashboardData(userId, isManager, broker),
    isManager ? getProfiles() : Promise.resolve([]),
  ])

  return (
    <DashboardClient
      canFilterByBroker={isManager}
      profiles={profiles as Profile[]}
      selectedBroker={broker}
      data={dashboardData}
    />
  )
}
