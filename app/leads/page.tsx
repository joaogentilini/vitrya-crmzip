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

async function LeadsContent() {
  const supabase = await createClient()

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })

  const { data: leadsRaw } = await supabase
    .from('leads')
    .select('id, title, status, pipeline_id, stage_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

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

      <CreateLeadForm pipelines={pipelines} stages={stages} />

      <LeadsList leads={leads} pipelines={pipelines} stages={stages} />
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
