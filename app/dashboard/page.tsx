export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'

interface Profile {
  id: string
  full_name: string | null
}

async function getDashboardData(userId: string, isAdmin: boolean, filterUserId?: string) {
  const supabase = await createClient()
  
  const targetUserId = isAdmin && filterUserId ? filterUserId : (isAdmin ? null : userId)
  
  let leadsQuery = supabase.from('leads').select('id, title, status, stage_id, assigned_to, created_at')
  if (targetUserId) {
    leadsQuery = leadsQuery.or(`created_by.eq.${targetUserId},assigned_to.eq.${targetUserId}`)
  }
  const { data: leads } = await leadsQuery

  let tasksQuery = supabase.from('tasks').select('id, lead_id, title, type, due_at, status, assigned_to')
    .eq('status', 'open')
  if (targetUserId) {
    tasksQuery = tasksQuery.or(`assigned_to.eq.${targetUserId},created_by.eq.${targetUserId}`)
  }
  const { data: tasks } = await tasksQuery

  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 999)

  const leadsWithOpenTask = new Set(tasks?.map(t => t.lead_id) || [])
  const leadsWithoutAction = leads?.filter(l => !leadsWithOpenTask.has(l.id)) || []
  
  const overdueTasks = tasks?.filter(t => new Date(t.due_at) < now) || []
  const overdueLeadIds = new Set(overdueTasks.map(t => t.lead_id))
  const overdueLeads = leads?.filter(l => overdueLeadIds.has(l.id)) || []

  const upcomingTasks = tasks?.filter(t => {
    const dueDate = new Date(t.due_at)
    return dueDate >= now && dueDate <= tomorrow
  }) || []

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const todayTasks = tasks?.filter(t => {
    const dueDate = new Date(t.due_at)
    return dueDate >= todayStart && dueDate <= todayEnd
  }).sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()) || []

  const wonLeads = leads?.filter(l => l.status === 'won') || []
  const lostLeads = leads?.filter(l => l.status === 'lost') || []

  return {
    totalLeads: leads?.length || 0,
    leadsWithoutAction: leadsWithoutAction.slice(0, 10),
    leadsWithoutActionCount: leadsWithoutAction.length,
    overdueLeads: overdueLeads.slice(0, 10),
    overdueLeadsCount: overdueLeads.length,
    upcomingTasksCount: upcomingTasks.length,
    todayTasks: todayTasks.slice(0, 10),
    wonCount: wonLeads.length,
    lostCount: lostLeads.length,
    leads: leads || [],
  }
}

async function getProfiles() {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name')
  return data || []
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ broker?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    redirect('/')
  }

  const userId = userRes.user.id
  const userEmail = userRes.user.email

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', userId)
    .single()

  const isAdmin = profile?.role === 'admin'

  const [dashboardData, profiles] = await Promise.all([
    getDashboardData(userId, isAdmin, params.broker),
    isAdmin ? getProfiles() : Promise.resolve([])
  ])

  return (
    <DashboardClient
      userEmail={userEmail}
      isAdmin={isAdmin}
      profiles={profiles as Profile[]}
      selectedBroker={params.broker}
      data={dashboardData}
    />
  )
}
