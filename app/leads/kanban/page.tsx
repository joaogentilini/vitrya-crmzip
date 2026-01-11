export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { KanbanBoard } from './KanbanBoard'


export default async function LeadsKanbanPage() {
  const supabase = await createClient()

  const { data: userRes } = await supabase.auth.getUser()
  const userId = userRes?.user?.id

  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })

  const pipelineId = pipelines?.[0]?.id ?? null

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id, name, position')
    .order('position', { ascending: true })

  const { data: leads } = await supabase
    .from('leads')
    .select('id, title, status, pipeline_id, stage_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Kanban</h1>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
        Usuário: {userId ?? '(não autenticado)'}
      </div>

      <div style={{ marginTop: 12 }}>
        <a href="/leads" style={{ fontSize: 14 }}>Voltar para Leads</a>
      </div>

      <KanbanBoard
  pipelines={pipelines ?? []}
  stages={stages ?? []}
  leads={leads ?? []}
  defaultPipelineId={pipelineId}
/>
    </div>
  )
}
