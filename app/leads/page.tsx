export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { CreateLeadForm } from './CreateLeadForm'
import { LeadsAppShell } from './LeadsAppShell'
import { LeadsList } from './LeadsList'
import { PageSkeleton } from '@/components/ui/Skeleton'
import { Suspense } from 'react'

type LeadRow = {
  id: string
  title: string
  status: 'open' | 'won' | 'lost' | string
  pipeline_id: string | null
  stage_id: string | null
  created_at: string
  client_name?: string | null
  phone_raw?: string | null
  lead_type_id?: string | null
  lead_interest_id?: string | null
  lead_source_id?: string | null
  owner_user_id?: string | null
}

type UserProfile = {
  id: string
  full_name: string
  role: string
}

type CatalogItem = {
  id: string
  name: string
}

type PipelineRow = {
  id: string
  name: string
  created_at: string
}

type StageRow = {
  id: string
  pipeline_id: string
  name: string
  position: number
}

export type LeadTaskStatus = {
  lead_id: string
  next_due_at: string | null
  is_overdue: boolean
  has_open_task: boolean
}

async function LeadsContent() {
  const supabase = await createClient()

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .single()

  const isAdminOrGestor = currentProfile?.role === 'admin' || currentProfile?.role === 'gestor'

  const { data: leadsRaw } = await supabase
    .from('leads')
    .select('id, title, status, pipeline_id, stage_id, created_at, client_name, phone_raw, lead_type_id, lead_interest_id, lead_source_id, owner_user_id')
    .order('created_at', { ascending: false })
    .limit(200)

  let corretores: UserProfile[] = []
  if (isAdminOrGestor) {
    const { data: corretoresRaw } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    
    corretores = (corretoresRaw ?? []) as UserProfile[]
  }

  // Fetch catalogs for the form
  const { data: leadTypesRaw } = await supabase
    .from('lead_types')
    .select('id, name')
    .eq('is_active', true)
    .order('position', { ascending: true })

  const { data: leadInterestsRaw } = await supabase
    .from('lead_interests')
    .select('id, name')
    .eq('is_active', true)
    .order('position', { ascending: true })

  const { data: leadSourcesRaw } = await supabase
    .from('lead_sources')
    .select('id, name')
    .eq('is_active', true)
    .order('position', { ascending: true })

  const leadTypes = (leadTypesRaw ?? []) as CatalogItem[]
  const leadInterests = (leadInterestsRaw ?? []) as CatalogItem[]
  const leadSources = (leadSourcesRaw ?? []) as CatalogItem[]

  const leads = (leadsRaw ?? []) as LeadRow[]

  const { data: pipelinesRaw } = await supabase
    .from('pipelines')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })

  const pipelines = (pipelinesRaw ?? []) as PipelineRow[]

  const { data: stagesRaw } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id, name, position')
    .order('position', { ascending: true })

  const stages = (stagesRaw ?? []) as StageRow[]

  const leadIds = leads.map(l => l.id)
  let taskStatusMap: Map<string, LeadTaskStatus> = new Map()

  if (leadIds.length > 0) {
    const { data: tasksRaw } = await supabase
      .from('tasks')
      .select('lead_id, due_at')
      .eq('status', 'open')
      .in('lead_id', leadIds)
      .order('due_at', { ascending: true })

    if (tasksRaw) {
      const now = new Date()
      const tasksByLead = new Map<string, { due_at: string }[]>()
      
      for (const task of tasksRaw) {
        const existing = tasksByLead.get(task.lead_id) || []
        existing.push(task)
        tasksByLead.set(task.lead_id, existing)
      }

      for (const leadId of leadIds) {
        const leadTasks = tasksByLead.get(leadId) || []
        const nextTask = leadTasks[0]
        const isOverdue = nextTask ? new Date(nextTask.due_at) < now : false
        
        taskStatusMap.set(leadId, {
          lead_id: leadId,
          next_due_at: nextTask?.due_at || null,
          is_overdue: isOverdue,
          has_open_task: leadTasks.length > 0
        })
      }
    }
  }

  const taskStatus = Array.from(taskStatusMap.values())

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Leads
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {leadsCount ?? 0} {leadsCount === 1 ? 'lead' : 'leads'} no total
          </p>
        </div>
      </div>

      <CreateLeadForm 
        pipelines={pipelines} 
        stages={stages}
        leadTypes={leadTypes}
        leadInterests={leadInterests}
        leadSources={leadSources}
      />

      <LeadsList 
        leads={leads} 
        pipelines={pipelines} 
        stages={stages} 
        taskStatus={taskStatus}
        corretores={corretores}
        isAdminOrGestor={isAdminOrGestor}
        leadTypes={leadTypes}
        leadInterests={leadInterests}
        leadSources={leadSources}
      />
    </div>
  )
}

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: userRes } = await supabase.auth.getUser()
  const userEmail = userRes?.user?.email

  return (
    <LeadsAppShell userEmail={userEmail} pageTitle="Lista de Leads">
      <Suspense fallback={<PageSkeleton />}>
        <LeadsContent />
      </Suspense>
    </LeadsAppShell>
  )
}
