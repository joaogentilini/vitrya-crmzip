export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { KanbanBoard } from './KanbanBoard'
import { LeadsAppShell } from '../LeadsAppShell'
import { EmptyState, emptyStateIcons } from '@/components/ui/EmptyState'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export default async function LeadsKanbanPage() {
  const supabase = await createClient()

  const { data: userRes } = await supabase.auth.getUser()
  const userEmail = userRes?.user?.email

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

  const hasData = pipelines && pipelines.length > 0 && stages && stages.length > 0

  return (
    <LeadsAppShell userEmail={userEmail} pageTitle="Kanban">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Kanban
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Visualize e gerencie seus leads por etapas
          </p>
        </div>

        {hasData ? (
          <KanbanBoard
            pipelines={pipelines ?? []}
            stages={stages ?? []}
            leads={leads ?? []}
            defaultPipelineId={pipelineId}
          />
        ) : (
          <EmptyState
            title="Nenhum pipeline configurado"
            description="Configure um pipeline com estágios para começar a usar o Kanban."
            icon={emptyStateIcons.kanban}
            action={
              <Link href="/leads">
                <Button>Ir para Leads</Button>
              </Link>
            }
          />
        )}
      </div>
    </LeadsAppShell>
  )
}
