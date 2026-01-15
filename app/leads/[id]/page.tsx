export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { notFound, redirect } from 'next/navigation'
import { LeadsAppShell } from '../LeadsAppShell'
import { LeadDetailsClient } from './LeadDetailsClient'
import { ensureUserProfile } from '@/lib/auth'

type LeadRow = {
  id: string
  title: string
  status: 'open' | 'won' | 'lost' | string
  pipeline_id: string | null
  stage_id: string | null
  created_at: string
  created_by: string | null
  assigned_to: string | null
  client_name: string | null
  phone_raw: string | null
  phone_e164: string | null
  lead_type_id: string | null
  lead_interest_id: string | null
  lead_source_id: string | null
  budget_range: string | null
  notes: string | null
}

type CatalogItem = {
  id: string
  name: string
}

type PipelineRow = {
  id: string
  name: string
}

type StageRow = {
  id: string
  pipeline_id: string
  name: string
  position: number
}

export type AuditLogRow = {
  id: string
  lead_id: string
  actor_id: string
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

export type ActorProfile = {
  id: string
  name: string | null
  full_name: string | null
  email: string | null
}

export type TaskRow = {
  id: string
  lead_id: string
  title: string
  type: 'call' | 'whatsapp' | 'visit' | 'proposal' | 'email' | 'other'
  due_at: string
  status: 'open' | 'done' | 'canceled'
  notes: string | null
  assigned_to: string
  created_by: string
  created_at: string
}

export default async function LeadDetailsPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params
  
  const profile = await ensureUserProfile()
  if (!profile) {
    redirect('/')
  }
  
  if (profile && profile.is_active === false) {
    redirect('/blocked')
  }

  const userEmail = profile.email
  const currentUserId = profile.id
  const supabase = await createClient()

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, title, status, pipeline_id, stage_id, created_at, created_by, assigned_to, client_name, phone_raw, phone_e164, lead_type_id, lead_interest_id, lead_source_id, budget_range, notes, owner_user_id')
    .eq('id', id)
    .single()

  // Fetch catalogs for display
  const { data: leadTypesRaw } = await supabase
    .from('lead_types')
    .select('id, name')
    .order('position', { ascending: true })

  const { data: leadInterestsRaw } = await supabase
    .from('lead_interests')
    .select('id, name')
    .order('position', { ascending: true })

  const { data: leadSourcesRaw } = await supabase
    .from('lead_sources')
    .select('id, name')
    .order('position', { ascending: true })

  const leadTypes = (leadTypesRaw ?? []) as CatalogItem[]
  const leadInterests = (leadInterestsRaw ?? []) as CatalogItem[]
  const leadSources = (leadSourcesRaw ?? []) as CatalogItem[]

  if (error || !lead) {
    notFound()
  }

  const { data: pipelinesRaw } = await supabase
    .from('pipelines')
    .select('id, name')
    .order('created_at', { ascending: true })

  const pipelines = (pipelinesRaw ?? []) as PipelineRow[]

  const { data: stagesRaw } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id, name, position')
    .order('position', { ascending: true })

  const stages = (stagesRaw ?? []) as StageRow[]

  const pipeline = pipelines.find(p => p.id === lead.pipeline_id)
  const stage = stages.find(s => s.id === lead.stage_id)

  const { data: tasksRaw } = await supabase
    .from('tasks')
    .select('id, lead_id, title, type, due_at, status, notes, assigned_to, created_by, created_at')
    .eq('lead_id', id)
    .eq('status', 'open')
    .order('due_at', { ascending: true })
    .limit(10)

  const tasks = (tasksRaw ?? []) as TaskRow[]

  const { data: currentUserProfile } = await supabase
    .from('profiles')
    .select('id, role')
    .single()

  const isAdmin = currentUserProfile?.role === 'admin'
  const isAdminOrGestor = currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'gestor'

  let corretores: { id: string; full_name: string }[] = []
  if (isAdminOrGestor) {
    const { data: corretoresRaw } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    
    corretores = (corretoresRaw ?? []) as { id: string; full_name: string }[]
  }

  const { data: allProfilesRaw } = await supabase
    .from('profiles')
    .select('id, full_name, name, email')
    .limit(100)

  const allProfiles = (allProfilesRaw ?? []) as ActorProfile[]

  let auditLogs: AuditLogRow[] = []
  let actorProfiles: ActorProfile[] = []

  const { data: auditLogsRaw, error: auditError } = await supabase
    .from('lead_audit_logs')
    .select('id, lead_id, actor_id, action, before, after, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!auditError && auditLogsRaw) {
    const parsedLogs = auditLogsRaw.map(log => {
      let parsedBefore = log.before
      let parsedAfter = log.after
      
      try {
        if (typeof log.before === 'string') {
          parsedBefore = JSON.parse(log.before)
        }
      } catch {
        parsedBefore = null
      }
      
      try {
        if (typeof log.after === 'string') {
          parsedAfter = JSON.parse(log.after)
        }
      } catch {
        parsedAfter = null
      }
      
      return {
        ...log,
        before: parsedBefore,
        after: parsedAfter,
      }
    }) as AuditLogRow[]

    const moveStageKeys = new Set<string>()
    for (const log of parsedLogs) {
      if (log.action === 'move_stage') {
        const fromId = String(log.before?.stage_id || '')
        const toId = String(log.after?.stage_id || '')
        const ts = Math.floor(new Date(log.created_at).getTime() / 1000)
        moveStageKeys.add(`${fromId}:${toId}:${ts}`)
        moveStageKeys.add(`${fromId}:${toId}:${ts - 1}`)
        moveStageKeys.add(`${fromId}:${toId}:${ts + 1}`)
      }
    }

    auditLogs = parsedLogs.filter(log => {
      if (log.action !== 'update') return true
      
      const before = log.before as Record<string, unknown> | null
      const after = log.after as Record<string, unknown> | null
      if (!before || !after) return true
      
      if (before.stage_id === after.stage_id) return true
      
      const changedFields: string[] = []
      const fieldsToCheck = ['stage_id', 'status', 'title', 'client_name', 'phone_e164', 'notes', 'assigned_to', 'pipeline_id', 'lead_type_id', 'lead_interest_id', 'lead_source_id', 'budget_range']
      for (const field of fieldsToCheck) {
        if (before[field] !== after[field]) changedFields.push(field)
      }
      
      if (changedFields.length === 1 && changedFields[0] === 'stage_id') {
        const ts = new Date(log.created_at).getTime()
        const key = `${String(before.stage_id)}:${String(after.stage_id)}:${Math.floor(ts / 1000)}`
        return !moveStageKeys.has(key)
      }
      
      return true
    })

    const actorIds = [...new Set(auditLogs.map(l => l.actor_id).filter(Boolean))]
    
    if (actorIds.length > 0) {
      const { data: profilesRaw } = await supabase
        .from('profiles')
        .select('id, name, full_name, email')
        .in('id', actorIds)

      if (profilesRaw) {
        actorProfiles = profilesRaw as ActorProfile[]
      }
    }
  }

  return (
    <LeadsAppShell 
      userEmail={userEmail} 
      pageTitle={lead.title}
      showNewLeadButton={false}
    >
      <LeadDetailsClient
        lead={lead as LeadRow}
        pipeline={pipeline}
        stage={stage}
        pipelines={pipelines}
        stages={stages}
        auditLogs={auditLogs}
        actorProfiles={actorProfiles}
        tasks={tasks}
        allProfiles={allProfiles}
        isAdmin={isAdmin}
        isAdminOrGestor={isAdminOrGestor}
        leadTypes={leadTypes}
        leadInterests={leadInterests}
        leadSources={leadSources}
        corretores={corretores}
        currentUserId={currentUserId}
      />
    </LeadsAppShell>
  )
}
