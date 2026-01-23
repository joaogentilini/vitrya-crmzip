export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { AgendaClient } from './AgendaClient'
import { ensureUserProfile } from '@/lib/auth'

interface Task {
  id: string
  lead_id: string
  title: string
  type: string
  due_at: string
  status: string
  assigned_to: string
}

interface Lead {
  id: string
  title: string
}

interface Profile {
  id: string
  full_name: string | null
}

async function getAgendaData(userId: string, isAdmin: boolean, filterUserId?: string, view: 'today' | 'week' = 'today') {
  const supabase = await createClient()
  
  const targetUserId = isAdmin && filterUserId ? filterUserId : (isAdmin ? null : userId)
  
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  
  let endDate: Date
  if (view === 'week') {
    endDate = new Date(todayStart)
    endDate.setDate(endDate.getDate() + 7)
  } else {
    endDate = new Date(todayStart)
    endDate.setDate(endDate.getDate() + 1)
  }

  let tasksQuery = supabase.from('tasks')
    .select('id, lead_id, title, type, due_at, status, assigned_to')
    .eq('status', 'open')
    .gte('due_at', todayStart.toISOString())
    .lt('due_at', endDate.toISOString())
    .order('due_at', { ascending: true })
  
  if (targetUserId) {
    tasksQuery = tasksQuery.or(`assigned_to.eq.${targetUserId},created_by.eq.${targetUserId}`)
  }
  
  const { data: tasks } = await tasksQuery

  let overdueQuery = supabase.from('tasks')
    .select('id, lead_id, title, type, due_at, status, assigned_to')
    .eq('status', 'open')
    .lt('due_at', todayStart.toISOString())
    .order('due_at', { ascending: true })
  
  if (targetUserId) {
    overdueQuery = overdueQuery.or(`assigned_to.eq.${targetUserId},created_by.eq.${targetUserId}`)
  }

  const { data: overdueTasks } = await overdueQuery

  const leadIds = [...new Set([...(tasks || []), ...(overdueTasks || [])].map(t => t.lead_id))]
  
  let leads: Lead[] = []
  if (leadIds.length > 0) {
    const { data: leadsData } = await supabase
      .from('leads')
      .select('id, title')
      .in('id', leadIds)
    leads = leadsData || []
  }

  return {
    tasks: tasks || [],
    overdueTasks: overdueTasks || [],
    leads,
  }
}

async function getProfiles() {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name')
  return data || []
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ broker?: string; view?: string }> }) {
  const params = await searchParams
  
  const profile = await ensureUserProfile()
  if (!profile) {
    redirect('/')
  }
  
  if (profile && profile.is_active === false) {
    redirect('/blocked')
  }

  const userId = profile.id
  const isAdmin = profile.role === 'admin'
  const view = (params.view === 'week' ? 'week' : 'today') as 'today' | 'week'

  const [agendaData, profiles] = await Promise.all([
    getAgendaData(userId, isAdmin, params.broker, view),
    isAdmin ? getProfiles() : Promise.resolve([])
  ])

  return (
    <AgendaClient
      isAdmin={isAdmin}
      profiles={profiles as Profile[]}
      selectedBroker={params.broker}
      view={view}
      data={agendaData}
    />
  )
}
