'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/Toast'
import { completeCampaignTask } from './actions'

interface Profile {
  id: string
  full_name: string | null
}

interface Lead {
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

interface Task {
  id: string
  lead_id: string
  title: string
  type: string
  due_at: string | null
  status: string
  assigned_to: string | null
}

interface CampaignTask {
  id: string
  property_id: string
  title: string
  due_date: string
  done_at: string | null
}

interface PropertyMapItem {
  title: string | null
  city: string | null
  neighborhood: string | null
}

interface FunnelStage {
  id: string
  name: string
  position: number
  count: number
  fromFirstPct: number
  fromPreviousPct: number
}

interface ProposalSummary {
  id: string
  negotiationId: string | null
  title: string | null
  propertyTitle: string | null
  status: string | null
  totalValue: number
  updatedAt: string | null
  propertyId: string | null
}

interface PropertySummaryItem {
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

interface DashboardData {
  totalLeads: number
  leadsWithoutAction: Lead[]
  leadsWithoutActionCount: number
  overdueLeads: Lead[]
  overdueLeadsCount: number
  upcomingTasksCount: number
  todayTasks: Task[]
  wonCount: number
  lostCount: number
  leads: Lead[]
  campaignMetrics: {
    tasksTotal: number
    doneTotal: number
    pending: number
    overdue: number
    dueToday: number
    dueWeek: number
    pct: number
  }
  upcomingCampaignTasks: CampaignTask[]
  upcomingCampaignTasksTotal: number
  propertyMap: Record<string, PropertyMapItem>
  leadsFunnel: {
    pipelineId: string | null
    pipelineName: string | null
    stages: FunnelStage[]
    openCount: number
    wonCount: number
    lostCount: number
    winRatePct: number
    lossRatePct: number
  }
  dealsSummary: {
    totalProposals: number
    draftCount: number
    inReviewCount: number
    counterproposalCount: number
    approvedCount: number
    rejectedCount: number
    otherCount: number
    approvedSalesValue: number
    approvedAverageTicket: number
    recentProposals: ProposalSummary[]
  }
  financialSummary: {
    commissionPortfolio: number
    commissionReceivedInterval: number
    commissionPending: number
    approvedSalesCount: number
    approvedSalesValue: number
    averageCommissionPercent: number
    paymentsTableAvailable: boolean
    periodDays: number
  }
  propertiesSummary: {
    totalProperties: number
    activeProperties: number
    saleProperties: number
    rentProperties: number
    reservedProperties: number
    soldProperties: number
    avgSalePrice: number
    avgRentPrice: number
    recentProperties: PropertySummaryItem[]
  }
}

interface DashboardClientProps {
  canFilterByBroker: boolean
  profiles: Profile[]
  selectedBroker?: string
  data: DashboardData
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const taskTypeLabels: Record<string, string> = {
  call: 'Ligacao',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  proposal: 'Proposta',
  email: 'E-mail',
  other: 'Outro',
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function formatCurrency(value: number) {
  return BRL.format(value || 0)
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function ymdToBR(dateStr: string) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR')
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return '--:--'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTimeShort(dateStr: string | null | undefined) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeDays(dateStr: string | null) {
  if (!dateStr) return 'sem data'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 'sem data'
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'hoje'
  if (days === 1) return '1 dia'
  return `${days} dias`
}

function getLeadAgeDays(dateStr: string | null | undefined) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null
  const diff = Date.now() - date.getTime()
  return Math.max(Math.floor(diff / (1000 * 60 * 60 * 24)), 0)
}

function getLeadAgeBucket(days: number | null) {
  if (days === null) return 'Sem data'
  if (days <= 1) return '0-1 dia'
  if (days <= 7) return '2-7 dias'
  if (days <= 30) return '8-30 dias'
  return '31+ dias'
}

function getLeadHourBucket(dateStr: string | null | undefined) {
  if (!dateStr) return 'Sem horario'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 'Sem horario'
  const hour = date.getHours()
  if (hour < 6) return 'Madrugada'
  if (hour < 12) return 'Manha'
  if (hour < 18) return 'Tarde'
  return 'Noite'
}

function getProposalStatusLabel(status: string | null | undefined) {
  switch (normalizeText(status)) {
    case 'in_review':
      return 'Em análise'
    case 'counterproposal':
      return 'Contraproposta'
    case 'approved':
      return 'Aprovada'
    case 'rejected':
      return 'Rejeitada'
    case 'draft':
      return 'Rascunho'
    default:
      return 'Status'
  }
}

function getProposalStatusVariant(status: string | null | undefined): 'warning' | 'success' | 'destructive' | 'secondary' {
  switch (normalizeText(status)) {
    case 'approved':
      return 'success'
    case 'rejected':
      return 'destructive'
    case 'in_review':
    case 'counterproposal':
      return 'warning'
    default:
      return 'secondary'
  }
}

function getPropertyPurposeLabel(purpose: string | null | undefined) {
  const normalized = normalizeText(purpose)
  if (normalized.includes('venda') || normalized.includes('sale')) return 'Venda'
  if (normalized.includes('alug') || normalized.includes('rent') || normalized.includes('loca')) return 'Aluguel'
  return purpose || 'Indefinido'
}

function getPropertyStatusVariant(status: string | null | undefined): 'success' | 'warning' | 'secondary' {
  const normalized = normalizeText(status)
  if (normalized === 'active' || normalized === 'published' || normalized === 'ativo' || normalized === 'disponivel') {
    return 'success'
  }
  if (normalized === 'draft' || normalized === 'rascunho') {
    return 'warning'
  }
  return 'secondary'
}

function StatCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string
  value: string | number
  tone?: 'default' | 'warning' | 'danger' | 'success' | 'info' | 'brand'
  hint?: string
}) {
  const className = {
    default: 'text-[var(--foreground)]',
    warning: 'text-[var(--warning)]',
    danger: 'text-[var(--destructive)]',
    success: 'text-[var(--success)]',
    info: 'text-[var(--info)]',
    brand: 'text-[var(--primary)]',
  }[tone]

  return (
    <Card className="border-[var(--border)]/80">
      <CardContent className="px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
        <p className={`mt-1 text-xl font-bold leading-tight ${className}`}>{value}</p>
        {hint ? <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

function CollapsibleInfoCard({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="text-xs font-semibold text-[var(--muted-foreground)]">
            {open ? 'Ocultar' : 'Expandir'}
          </span>
        </button>
      </CardHeader>
      {open ? <CardContent className="space-y-3">{children}</CardContent> : null}
    </Card>
  )
}

function CompactBarChart({
  title,
  subtitle,
  items,
  barClassName = 'bg-[var(--primary)]',
}: {
  title: string
  subtitle?: string
  items: Array<{ label: string; value: number }>
  barClassName?: string
}) {
  const rows = items.filter((item) => Number.isFinite(item.value) && item.value >= 0)
  const max = rows.length > 0 ? Math.max(...rows.map((row) => row.value), 0) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle ? <p className="text-xs text-[var(--muted-foreground)]">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Sem dados para mostrar.</p>
        ) : (
          rows.map((row) => {
            const width = max > 0 ? Math.max((row.value / max) * 100, row.value > 0 ? 6 : 0) : 0
            return (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                  <span className="truncate">{row.label}</span>
                  <span className="font-semibold text-[var(--foreground)]">{row.value}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--muted)]">
                  <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function InvertedPyramidFunnel({
  title,
  subtitle,
  steps,
  selectedKey,
  onStepClick,
  animationName = 'vitryaFunnelDrop',
}: {
  title: string
  subtitle?: string
  steps: Array<{ key: string; label: string; count: number; meta?: string | null }>
  selectedKey?: string | null
  onStepClick?: (key: string) => void
  animationName?: string
}) {
  const [showIndices, setShowIndices] = useState(false)
  const palette = [
    'from-orange-500 via-amber-500 to-yellow-400',
    'from-amber-500 via-yellow-500 to-lime-400',
    'from-yellow-500 via-lime-500 to-emerald-400',
    'from-lime-500 via-emerald-500 to-teal-400',
    'from-emerald-500 via-teal-500 to-cyan-400',
  ]

  const normalized = useMemo(() => {
    const sanitized = steps.map((step) => ({
      ...step,
      count: Math.max(Math.floor(Number(step.count) || 0), 0),
    }))

    if (sanitized.length === 0) {
      return [] as Array<{
        key: string
        label: string
        count: number
        meta?: string | null
        width: number
        rate: number
      }>
    }

    const top = Math.max(sanitized[0].count, 1)
    let previous = sanitized[0].count

    return sanitized.map((step, index) => {
      const clamped = index === 0 ? step.count : Math.min(step.count, previous)
      previous = clamped
      const width = index === 0 ? 100 : Math.max(Math.round((clamped / top) * 100), clamped > 0 ? 24 : 18)
      const rate = top > 0 ? Math.round((clamped / top) * 100) : 0
      return {
        ...step,
        count: clamped,
        width,
        rate,
      }
    })
  }, [steps])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg font-extrabold text-[var(--foreground)]">{title}</CardTitle>
            {subtitle ? <p className="text-sm font-medium text-[var(--muted-foreground)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => setShowIndices((current) => !current)}
            className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          >
            {showIndices ? 'Ocultar índices' : 'Ver índices'}
          </button>
        </div>
      </CardHeader>
      <CardContent className={showIndices ? 'space-y-1' : 'space-y-0.5'}>
        {normalized.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Sem dados para montar o funil.</p>
        ) : (
          normalized.map((step, index) => {
            const isSelected = selectedKey === step.key
            const Wrapper: 'button' | 'div' = onStepClick ? 'button' : 'div'

            return (
              <div key={step.key} className="flex justify-center">
                <Wrapper
                  type={onStepClick ? 'button' : undefined}
                  onClick={onStepClick ? () => onStepClick(step.key) : undefined}
                  className={`relative w-full max-w-3xl rounded-xl border bg-gradient-to-r ${palette[index % palette.length]} px-2.5 text-white shadow-sm transition-transform duration-300 ${
                    showIndices ? 'py-0.5' : 'h-7'
                  } ${
                    onStepClick ? 'hover:scale-[1.01]' : ''
                  } ${isSelected ? 'border-white/90 ring-2 ring-white/60' : 'border-white/30'}`}
                  style={{
                    width: `${step.width}%`,
                    animation: `${animationName} 520ms cubic-bezier(0.2,0.8,0.2,1) ${index * 85}ms both`,
                  }}
                >
                  <div className={`flex items-center justify-between gap-2 ${showIndices ? '' : 'h-full'}`}>
                    <span className="truncate text-[11px] font-black uppercase tracking-wide [text-shadow:0_1px_0_rgba(0,0,0,0.35)]">
                      {step.label}
                    </span>
                    <span className="text-sm font-black [text-shadow:0_1px_0_rgba(0,0,0,0.35)]">{step.count}</span>
                  </div>
                  {showIndices ? (
                    <>
                      <div className="mt-px text-[10px] font-bold text-white">{step.rate}% do topo do funil</div>
                      {step.meta ? <div className="text-[10px] font-semibold text-white/95">{step.meta}</div> : null}
                    </>
                  ) : null}
                </Wrapper>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

export function DashboardClient({ canFilterByBroker, profiles, selectedBroker, data }: DashboardClientProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [selectedLeadStageId, setSelectedLeadStageId] = useState<string | null>(null)

  useEffect(() => {
    if (data.leadsFunnel.stages.length === 0) {
      setSelectedLeadStageId(null)
      return
    }
    setSelectedLeadStageId((current) => {
      if (current && data.leadsFunnel.stages.some((stage) => stage.id === current)) return current
      return data.leadsFunnel.stages[0].id
    })
  }, [data.leadsFunnel.stages])

  const leadFunnelSteps = useMemo(
    () =>
      data.leadsFunnel.stages.map((stage) => ({
        key: stage.id,
        label: stage.name,
        count: stage.count,
        meta: `Conversão etapa ${stage.fromPreviousPct}% | acumulada ${stage.fromFirstPct}%`,
      })),
    [data.leadsFunnel.stages]
  )

  const leadsByStageChart = useMemo(
    () =>
      data.leadsFunnel.stages
        .map((stage) => ({ label: stage.name, value: stage.count }))
        .filter((item) => item.value > 0),
    [data.leadsFunnel.stages]
  )

  const leadsLast7DaysChart = useMemo(() => {
    const buckets: Array<{ key: string; label: string; value: number }> = []
    const now = new Date()

    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now)
      date.setDate(now.getDate() - offset)
      const key = date.toISOString().slice(0, 10)
      buckets.push({
        key,
        label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        value: 0,
      })
    }

    const indexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]))
    for (const lead of data.leads) {
      const key = String(lead.created_at ?? '').slice(0, 10)
      const index = indexByKey.get(key)
      if (index === undefined) continue
      buckets[index].value += 1
    }

    return buckets.map(({ label, value }) => ({ label, value }))
  }, [data.leads])

  const dealsInProgressCount =
    data.dealsSummary.draftCount + data.dealsSummary.inReviewCount + data.dealsSummary.counterproposalCount

  const salesFunnelSteps = useMemo(
    () => [
      { key: 'all', label: 'Entrada de propostas', count: data.dealsSummary.totalProposals },
      { key: 'progress', label: 'Propostas em andamento', count: dealsInProgressCount },
      {
        key: 'decision',
        label: 'Em decisao',
        count: data.dealsSummary.inReviewCount + data.dealsSummary.counterproposalCount,
      },
      { key: 'approved', label: 'Aprovadas', count: data.dealsSummary.approvedCount },
      { key: 'sales', label: 'Vendas confirmadas', count: data.financialSummary.approvedSalesCount },
    ],
    [
      data.dealsSummary.approvedCount,
      data.dealsSummary.counterproposalCount,
      data.dealsSummary.inReviewCount,
      data.dealsSummary.totalProposals,
      data.financialSummary.approvedSalesCount,
      dealsInProgressCount,
    ]
  )

  const proposalConversionPct =
    data.dealsSummary.totalProposals > 0
      ? Math.round((data.dealsSummary.approvedCount / data.dealsSummary.totalProposals) * 100)
      : 0

  const selectedLeadStage = useMemo(
    () => data.leadsFunnel.stages.find((stage) => stage.id === selectedLeadStageId) ?? null,
    [data.leadsFunnel.stages, selectedLeadStageId]
  )

  const selectedStageLeads = useMemo(() => {
    if (!selectedLeadStageId || !data.leadsFunnel.pipelineId) return [] as Lead[]
    return data.leads.filter(
      (lead) => lead.pipeline_id === data.leadsFunnel.pipelineId && lead.stage_id === selectedLeadStageId
    )
  }, [data.leads, data.leadsFunnel.pipelineId, selectedLeadStageId])

  const selectedStageOrigins = useMemo(() => {
    const acc = new Map<string, number>()
    for (const lead of selectedStageLeads) {
      const key = lead.lead_source_name || 'Sem origem'
      acc.set(key, (acc.get(key) ?? 0) + 1)
    }
    return [...acc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }))
  }, [selectedStageLeads])

  const selectedStageInterests = useMemo(() => {
    const acc = new Map<string, number>()
    for (const lead of selectedStageLeads) {
      const key = lead.lead_interest_name || 'Sem interesse'
      acc.set(key, (acc.get(key) ?? 0) + 1)
    }
    return [...acc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }))
  }, [selectedStageLeads])

  const selectedStageAgeBreakdown = useMemo(() => {
    const acc = new Map<string, number>()
    for (const lead of selectedStageLeads) {
      const key = getLeadAgeBucket(getLeadAgeDays(lead.created_at))
      acc.set(key, (acc.get(key) ?? 0) + 1)
    }

    const orderedLabels = ['0-1 dia', '2-7 dias', '8-30 dias', '31+ dias', 'Sem data']
    return orderedLabels.map((label) => ({ label, value: acc.get(label) ?? 0 }))
  }, [selectedStageLeads])

  const selectedStageHourBreakdown = useMemo(() => {
    const acc = new Map<string, number>()
    for (const lead of selectedStageLeads) {
      const key = getLeadHourBucket(lead.created_at)
      acc.set(key, (acc.get(key) ?? 0) + 1)
    }

    const orderedLabels = ['Madrugada', 'Manha', 'Tarde', 'Noite', 'Sem horario']
    return orderedLabels.map((label) => ({ label, value: acc.get(label) ?? 0 }))
  }, [selectedStageLeads])

  const selectedStageAgeAvg = useMemo(() => {
    let total = 0
    let count = 0
    for (const lead of selectedStageLeads) {
      const days = getLeadAgeDays(lead.created_at)
      if (days === null) continue
      total += days
      count += 1
    }
    if (count === 0) return null
    return Math.round(total / count)
  }, [selectedStageLeads])

  const selectedStageLeadsPreview = useMemo(() => {
    return [...selectedStageLeads]
      .sort((a, b) => {
        const aTime = new Date(a.created_at).getTime()
        const bTime = new Date(b.created_at).getTime()
        if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
        return bTime - aTime
      })
      .slice(0, 12)
  }, [selectedStageLeads])

  const handleBrokerChange = (brokerId: string) => {
    if (brokerId === 'all') {
      router.push('/dashboard')
      return
    }
    router.push(`/dashboard?broker=${brokerId}`)
  }

  const handleComplete = useCallback(
    async (taskId: string) => {
      if (completingId === taskId) return
      setCompletingId(taskId)
      try {
        await completeCampaignTask(taskId)
        success('Tarefa concluida.')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : undefined
        error(message ?? 'Não foi possível concluir a tarefa.')
      } finally {
        setCompletingId((current) => (current === taskId ? null : current))
      }
    },
    [completingId, error, router, success]
  )

  return (
    <div className="space-y-6">
      {canFilterByBroker && profiles.length > 0 ? (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-[var(--muted-foreground)]">Escopo das metricas:</label>
          <select
            value={selectedBroker || 'all'}
            onChange={(event) => handleBrokerChange(event.target.value)}
            className="px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            <option value="all">Todos</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name || profile.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Tabs defaultValue="leads" className="space-y-4">
        <TabsList className="w-full justify-start gap-1 overflow-x-auto whitespace-nowrap flex-nowrap">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="deals">Negocios</TabsTrigger>
          <TabsTrigger value="finance">Financeiro</TabsTrigger>
          <TabsTrigger value="properties">Imóveis</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Leads totais" value={data.totalLeads} />
            <StatCard label="Sem acao" value={data.leadsWithoutActionCount} tone="warning" />
            <StatCard label="Atrasados" value={data.overdueLeadsCount} tone="danger" />
            <StatCard label="Proximas 24h" value={data.upcomingTasksCount} tone="info" />
          </div>

          <Card className="overflow-hidden border border-[var(--border)]">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">Funil de Conversão de Leads</CardTitle>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {data.leadsFunnel.pipelineName
                      ? `Pipeline: ${data.leadsFunnel.pipelineName}`
                      : 'Nenhum pipeline com estagios foi encontrado.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Abertos: {data.leadsFunnel.openCount}</Badge>
                  <Badge variant="success">Ganhos: {data.leadsFunnel.wonCount}</Badge>
                  <Badge variant="destructive">Perdidos: {data.leadsFunnel.lostCount}</Badge>
                  {canFilterByBroker ? (
                    <select
                      value={selectedBroker || 'all'}
                      onChange={(event) => handleBrokerChange(event.target.value)}
                      className="h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-xs text-[var(--foreground)]"
                    >
                      <option value="all">Todos os corretores</option>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.full_name || profile.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <InvertedPyramidFunnel
                title="Piramide Invertida de Leads"
                subtitle="Clique em uma etapa para abrir o descritivo."
                steps={leadFunnelSteps}
                selectedKey={selectedLeadStageId}
                onStepClick={setSelectedLeadStageId}
                animationName="vitryaRise"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                  <div className="text-xs uppercase text-[var(--muted-foreground)]">Taxa de ganho</div>
                  <div className="text-2xl font-bold text-[var(--success)]">{data.leadsFunnel.winRatePct}%</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                  <div className="text-xs uppercase text-[var(--muted-foreground)]">Taxa de perda</div>
                  <div className="text-2xl font-bold text-[var(--destructive)]">{data.leadsFunnel.lossRatePct}%</div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {selectedLeadStage ? `Descritivo da etapa: ${selectedLeadStage.name}` : 'Selecione uma etapa'}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Origem, interesse, idade do lead e horario de entrada/clique.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Leads na etapa: {selectedStageLeads.length}</Badge>
                    <Badge variant="outline">
                      Idade media: {selectedStageAgeAvg === null ? 'n/d' : `${selectedStageAgeAvg} dias`}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <CompactBarChart
                    title="Origem"
                    subtitle="Principais canais de entrada."
                    items={selectedStageOrigins}
                    barClassName="bg-gradient-to-r from-emerald-500 to-lime-400"
                  />
                  <CompactBarChart
                    title="Interesse"
                    subtitle="Interesses mais recorrentes na etapa."
                    items={selectedStageInterests}
                    barClassName="bg-gradient-to-r from-cyan-500 to-sky-400"
                  />
                  <CompactBarChart
                    title="Idade do lead"
                    subtitle="Tempo desde a entrada do lead."
                    items={selectedStageAgeBreakdown}
                    barClassName="bg-gradient-to-r from-amber-500 to-orange-400"
                  />
                  <CompactBarChart
                    title="Horario do clique/entrada"
                    subtitle="Faixa horaria de origem dos leads."
                    items={selectedStageHourBreakdown}
                    barClassName="bg-gradient-to-r from-slate-500 to-sky-500"
                  />
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">Leads da etapa selecionada</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Card clicavel: abre o lead.</p>
                  </div>
                  {selectedStageLeadsPreview.length === 0 ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
                      Sem leads nesta etapa no filtro atual.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {selectedStageLeadsPreview.map((lead) => {
                        const ageDays = getLeadAgeDays(lead.created_at)
                        return (
                          <Link
                            key={lead.id}
                            href={`/leads/${lead.id}`}
                            className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 transition-all hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)]">
                                {lead.title || `Lead ${lead.id.slice(0, 8)}`}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                                Entrada: {formatDateTimeShort(lead.created_at)}
                              </p>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="text-[10px]">
                                Origem: {lead.lead_source_name || 'Sem origem'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                Interesse: {lead.lead_interest_name || 'Sem interesse'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                Idade: {ageDays === null ? 'n/d' : `${ageDays}d`}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                Horario: {getLeadHourBucket(lead.created_at)}
                              </Badge>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <CompactBarChart
              title="Distribuicao por etapa"
              subtitle="Leads ativos por etapa do pipeline selecionado."
              items={leadsByStageChart}
              barClassName="bg-gradient-to-r from-orange-500 to-amber-400"
            />
            <CompactBarChart
              title="Novos leads (últimos 7 dias)"
              subtitle="Ritmo de entrada recente no CRM."
              items={leadsLast7DaysChart}
              barClassName="bg-gradient-to-r from-sky-500 to-cyan-400"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <CollapsibleInfoCard title="Acoes de hoje">
              {data.todayTasks.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhuma acao para hoje.</p>
              ) : (
                data.todayTasks.map((task) => {
                  const lead = data.leads.find((item) => item.id === task.lead_id)
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/leads/${task.lead_id}`}
                          className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] truncate block"
                        >
                          {lead?.title || 'Lead'}
                        </Link>
                        <p className="text-xs text-[var(--muted-foreground)]">{task.title}</p>
                      </div>
                      <div className="ml-2 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {taskTypeLabels[task.type] || task.type}
                        </Badge>
                        <span className="text-xs text-[var(--muted-foreground)]">{formatTime(task.due_at)}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </CollapsibleInfoCard>

            <CollapsibleInfoCard title="Leads sem acao">
              {data.leadsWithoutAction.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Todos os leads possuem acao.</p>
              ) : (
                data.leadsWithoutAction.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors"
                  >
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{lead.title}</span>
                    <Badge variant="warning" className="text-xs ml-2 shrink-0">
                      Sem acao
                    </Badge>
                  </Link>
                ))
              )}
            </CollapsibleInfoCard>

            <CollapsibleInfoCard title="Leads atrasados">
              {data.overdueLeads.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhum lead atrasado.</p>
              ) : (
                data.overdueLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors"
                  >
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{lead.title}</span>
                    <Badge variant="destructive" className="text-xs ml-2 shrink-0">
                      Atrasado
                    </Badge>
                  </Link>
                ))
              )}
            </CollapsibleInfoCard>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-[var(--foreground)]">Campanhas</h2>
              <p className="text-sm text-[var(--muted-foreground)]">Acompanhe execução e prioridades de marketing.</p>
            </div>
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-[var(--radius)] hover:bg-[var(--primary)]/90 transition-colors text-sm font-medium"
            >
              Ver todas
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-4">
            <StatCard label="Total" value={data.campaignMetrics.tasksTotal} />
            <StatCard label="Concluidas" value={data.campaignMetrics.doneTotal} tone="success" />
            <StatCard label="Pendentes" value={data.campaignMetrics.pending} tone="warning" />
            <StatCard label="Atrasadas" value={data.campaignMetrics.overdue} tone="danger" />
            <StatCard label="Hoje" value={data.campaignMetrics.dueToday} tone="info" />
            <StatCard label="Esta semana" value={data.campaignMetrics.dueWeek} tone="brand" />
            <StatCard label="Execução" value={`${data.campaignMetrics.pct}%`} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Proximas tarefas</CardTitle>
                  <p className="text-sm text-[var(--muted-foreground)]">Pendencias mais proximas por vencimento.</p>
                </div>
                <Link
                  href="/campaigns"
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent)]"
                >
                  Ver tudo {data.upcomingCampaignTasksTotal ? `(${data.upcomingCampaignTasksTotal})` : ''}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.upcomingCampaignTasks.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Sem tarefas pendentes.</p>
              ) : (
                data.upcomingCampaignTasks.map((task) => {
                  const property = data.propertyMap[task.property_id]
                  const propertyName = property?.title || `Imóvel ${task.property_id.slice(0, 6)}`
                  const location = [property?.neighborhood, property?.city].filter(Boolean).join(' - ')
                  return (
                    <div
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--foreground)] truncate">{task.title}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{ymdToBR(task.due_date)}</p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">
                          {propertyName}
                          {location ? ` - ${location}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleComplete(task.id)}
                          disabled={completingId === task.id}
                          className="px-3 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {completingId === task.id ? 'Concluindo...' : 'Concluir'}
                        </button>
                        <Link
                          href={`/campaigns/${task.property_id}`}
                          className="px-3 py-1 text-xs rounded-lg bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity"
                        >
                          Abrir
                        </Link>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deals" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard label="Propostas totais" value={data.dealsSummary.totalProposals} />
            <StatCard
              label="Em análise"
              value={data.dealsSummary.inReviewCount + data.dealsSummary.counterproposalCount}
              tone="warning"
            />
            <StatCard label="Aprovadas" value={data.dealsSummary.approvedCount} tone="success" />
            <StatCard label="Rejeitadas" value={data.dealsSummary.rejectedCount} tone="danger" />
            <StatCard
              label="Ticket médio aprovado"
              value={formatCurrency(data.dealsSummary.approvedAverageTicket)}
              tone="brand"
            />
          </div>

          <InvertedPyramidFunnel
            title="Funil de vendas (piramide invertida)"
            subtitle="Fluxo comercial das propostas até a venda confirmada."
            steps={salesFunnelSteps}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Taxa de aprovacao" value={`${proposalConversionPct}%`} tone="success" />
            <StatCard
              label="Taxa de rejeicao"
              value={
                data.dealsSummary.totalProposals > 0
                  ? `${Math.round((data.dealsSummary.rejectedCount / data.dealsSummary.totalProposals) * 100)}%`
                  : '0%'
              }
              tone="danger"
            />
            <StatCard
              label="Pendentes de decisao"
              value={data.dealsSummary.inReviewCount + data.dealsSummary.counterproposalCount}
              tone="warning"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ultimas propostas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.dealsSummary.recentProposals.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhuma proposta registrada.</p>
              ) : (
                data.dealsSummary.recentProposals.map((proposal) => {
                  const href = proposal.propertyId
                    ? `/properties/${proposal.propertyId}?tab=negociacoes${
                        proposal.negotiationId ? `&negotiationId=${proposal.negotiationId}` : ''
                      }&proposalId=${proposal.id}`
                    : '/properties'

                  return (
                    <Link
                      key={proposal.id}
                      href={href}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 hover:bg-[var(--accent)]/60 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                          {proposal.title || `Proposta ${proposal.id.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">
                          {proposal.propertyTitle || 'Imóvel não informado'}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Atualizada ha {formatRelativeDays(proposal.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getProposalStatusVariant(proposal.status)}>
                          {getProposalStatusLabel(proposal.status)}
                        </Badge>
                        <span className="text-sm font-semibold text-[var(--foreground)]">{formatCurrency(proposal.totalValue)}</span>
                      </div>
                    </Link>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finance" className="space-y-6">
          {!data.financialSummary.paymentsTableAvailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              A tabela de pagamentos de comissão ainda não existe neste banco. Os indicadores de recebido/pendente estão em
              modo estimado.
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Comissão total da carteira"
              value={formatCurrency(data.financialSummary.commissionPortfolio)}
              hint="Baseada em propostas aprovadas."
            />
            <StatCard
              label={`Comissão recebida (${data.financialSummary.periodDays}d)`}
              value={formatCurrency(data.financialSummary.commissionReceivedInterval)}
              tone="success"
            />
            <StatCard
              label="Comissão pendente"
              value={formatCurrency(data.financialSummary.commissionPending)}
              tone="warning"
            />
            <StatCard
              label="Valor de vendas aprovadas"
              value={formatCurrency(data.financialSummary.approvedSalesValue)}
              tone="brand"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard label="Vendas aprovadas" value={data.financialSummary.approvedSalesCount} />
            <StatCard
              label="Média de comissão"
              value={formatPercent(data.financialSummary.averageCommissionPercent)}
              tone="brand"
            />
            <StatCard
              label="Ticket médio aprovado"
              value={
                data.financialSummary.approvedSalesCount > 0
                  ? formatCurrency(data.financialSummary.approvedSalesValue / data.financialSummary.approvedSalesCount)
                  : formatCurrency(0)
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="properties" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
            <StatCard label="Total" value={data.propertiesSummary.totalProperties} />
            <StatCard label="Ativos" value={data.propertiesSummary.activeProperties} tone="success" />
            <StatCard label="Venda" value={data.propertiesSummary.saleProperties} tone="brand" />
            <StatCard label="Aluguel" value={data.propertiesSummary.rentProperties} tone="info" />
            <StatCard label="Reservados" value={data.propertiesSummary.reservedProperties} tone="warning" />
            <StatCard label="Vendidos" value={data.propertiesSummary.soldProperties} tone="danger" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label="Preço médio venda" value={formatCurrency(data.propertiesSummary.avgSalePrice)} />
            <StatCard label="Preço médio aluguel" value={formatCurrency(data.propertiesSummary.avgRentPrice)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Imóveis recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.propertiesSummary.recentProperties.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhum imóvel encontrado.</p>
              ) : (
                data.propertiesSummary.recentProperties.map((property) => (
                  <Link
                    key={property.id}
                    href={`/properties/${property.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 hover:bg-[var(--accent)]/60 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                        {property.title || `Imóvel ${property.id.slice(0, 8)}`}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {property.city || 'Cidade não informada'} - {ymdToBR(property.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getPropertyPurposeLabel(property.purpose)}</Badge>
                      <Badge variant={getPropertyStatusVariant(property.status)}>{property.status || 'status'}</Badge>
                      <span className="text-sm font-semibold text-[var(--foreground)]">
                        {getPropertyPurposeLabel(property.purpose) === 'Aluguel'
                          ? formatCurrency(toFiniteNumber(property.rent_price))
                          : formatCurrency(toFiniteNumber(property.price))}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <style jsx global>{`
        @keyframes vitryaRise {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes vitryaFunnelDrop {
          0% {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
