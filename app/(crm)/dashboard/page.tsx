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

type CampaignMetrics = {
  tasksTotal: number
  doneTotal: number
  pending: number
  overdue: number
  dueToday: number
  dueWeek: number
  pct: number
}

async function getDashboardData(userId: string, isAdmin: boolean, filterUserId?: string) {
  const supabase = await createClient()

  const targetUserId = isAdmin && filterUserId ? filterUserId : isAdmin ? null : userId

  let leadsQuery = supabase
    .from('leads')
    .select('id, title, status, stage_id, assigned_to, created_at')

  if (targetUserId) {
    leadsQuery = leadsQuery.or(`created_by.eq.${targetUserId},assigned_to.eq.${targetUserId}`)
  }

  const { data: leads } = await leadsQuery

  let tasksQuery = supabase
    .from('tasks')
    .select('id, lead_id, title, type, due_at, status, assigned_to')
    .eq('status', 'open')

  if (targetUserId) {
    tasksQuery = tasksQuery.or(`assigned_to.eq.${targetUserId},created_by.eq.${targetUserId}`)
  }

  const { data: tasks } = await tasksQuery

  // =========================
  // Campanhas — métricas
  // =========================
  const { data: campaignTasks, error: campaignError } = await supabase
    .from('property_campaign_tasks')
    .select('property_id, due_date, done_at')

  let campaignMetrics: CampaignMetrics = {
    tasksTotal: 0,
    doneTotal: 0,
    pending: 0,
    overdue: 0,
    dueToday: 0,
    dueWeek: 0,
    pct: 0,
  }

  if (!campaignError && campaignTasks) {
    const today = new Date()
    const todayYMD = today.toISOString().slice(0, 10)

    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndYMD = weekEnd.toISOString().slice(0, 10)

    for (const task of campaignTasks as any[]) {
      campaignMetrics.tasksTotal += 1

      if (task.done_at) {
        campaignMetrics.doneTotal += 1
        continue
      }

      campaignMetrics.pending += 1

      const dueYMD =
        typeof task.due_date === 'string' ? task.due_date.slice(0, 10) : String(task.due_date).slice(0, 10)

      if (dueYMD < todayYMD) campaignMetrics.overdue += 1
      else if (dueYMD === todayYMD) campaignMetrics.dueToday += 1
      else if (dueYMD <= weekEndYMD) campaignMetrics.dueWeek += 1
    }

    campaignMetrics.pct =
      campaignMetrics.tasksTotal > 0
        ? Math.round((campaignMetrics.doneTotal / campaignMetrics.tasksTotal) * 100)
        : 0
  }

  // =========================
  // Campanhas — próximas tarefas
  // =========================
  const { data: upcomingCampaignTasks } = await supabase
    .from('property_campaign_tasks')
    .select('id, property_id, title, due_date, done_at')
    .is('done_at', null)
    .order('due_date', { ascending: true })
    .limit(10)

  // Buscar properties para nomes (map)
  let propertyMap: Record<string, { title: string | null; city: string | null; neighborhood: string | null }> = {}

  if (upcomingCampaignTasks && upcomingCampaignTasks.length > 0) {
    const propertyIds = [...new Set((upcomingCampaignTasks as any[]).map((t) => t.property_id).filter(Boolean))]

    if (propertyIds.length > 0) {
      const { data: properties } = await supabase
        .from('properties')
        .select('id, title, city, neighborhood')
        .in('id', propertyIds)

      if (properties) {
        propertyMap = (properties as any[]).reduce((acc, prop) => {
          acc[prop.id] = {
            title: prop.title ?? null,
            city: prop.city ?? null,
            neighborhood: prop.neighborhood ?? null,
          }
          return acc
        }, {} as Record<string, { title: string | null; city: string | null; neighborhood: string | null }>)
      }
    }
  }

  // =========================
  // Métricas leads/tasks (seu código)
  // =========================
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 999)

  const leadsWithOpenTask = new Set((tasks as any[])?.map((t) => t.lead_id) || [])
  const leadsWithoutAction = (leads as any[])?.filter((l) => !leadsWithOpenTask.has(l.id)) || []

  const overdueTasks = (tasks as any[])?.filter((t) => new Date(t.due_at) < now) || []
  const overdueLeadIds = new Set(overdueTasks.map((t) => t.lead_id))
  const overdueLeads = (leads as any[])?.filter((l) => overdueLeadIds.has(l.id)) || []

  const upcomingTasks =
    (tasks as any[])?.filter((t) => {
      const dueDate = new Date(t.due_at)
      return dueDate >= now && dueDate <= tomorrow
    }) || []

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const todayTasks =
    (tasks as any[])
      ?.filter((t) => {
        const dueDate = new Date(t.due_at)
        return dueDate >= todayStart && dueDate <= todayEnd
      })
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()) || []

  const wonLeads = (leads as any[])?.filter((l) => l.status === 'won') || []
  const lostLeads = (leads as any[])?.filter((l) => l.status === 'lost') || []

  return {
    totalLeads: (leads as any[])?.length || 0,
    leadsWithoutAction: leadsWithoutAction.slice(0, 10),
    leadsWithoutActionCount: leadsWithoutAction.length,
    overdueLeads: overdueLeads.slice(0, 10),
    overdueLeadsCount: overdueLeads.length,
    upcomingTasksCount: upcomingTasks.length,
    todayTasks: todayTasks.slice(0, 10),
    wonCount: wonLeads.length,
    lostCount: lostLeads.length,
    leads: (leads as any[]) || [],

    // Campanhas
    campaignMetrics,
    upcomingCampaignTasks: (upcomingCampaignTasks as any[]) || [],
    propertyMap,
  }
}

async function getProfiles() {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name')
  return data || []
}

// ✅ Next App Router: searchParams NÃO é Promise
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { broker?: string }
}) {
  const broker = searchParams?.broker

  const profile = await ensureUserProfile()
  if (!profile) redirect('/')

  if (profile && (profile as any).is_active === false) {
    redirect('/blocked')
  }

  const userId = (profile as any).id
  const isAdmin = (profile as any).role === 'admin'

  const [dashboardData, profiles] = await Promise.all([
    getDashboardData(userId, isAdmin, broker),
    isAdmin ? getProfiles() : Promise.resolve([]),
  ])

  return (
    <DashboardClient
      isAdmin={isAdmin}
      profiles={profiles as Profile[]}
      selectedBroker={broker}
      data={dashboardData}
    />
  )
}
