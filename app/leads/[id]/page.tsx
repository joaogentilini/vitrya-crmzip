export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import { LeadsAppShell } from '../LeadsAppShell'
import { LeadDetailsClient } from './LeadDetailsClient'

type LeadRow = {
  id: string
  title: string
  status: 'open' | 'won' | 'lost' | string
  pipeline_id: string | null
  stage_id: string | null
  created_at: string
  created_by: string | null
  assigned_to: string | null
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

export default async function LeadDetailsPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: userRes } = await supabase.auth.getUser()
  const userEmail = userRes?.user?.email

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, title, status, pipeline_id, stage_id, created_at, created_by, assigned_to')
    .eq('id', id)
    .single()

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
      />
    </LeadsAppShell>
  )
}
