export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { CreateLeadForm } from './CreateLeadForm'
import { ClientDate } from './ClientDate'
import { LeadsAppShell } from './LeadsAppShell'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

type LeadRow = {
  id: string
  title: string
  status: 'open' | 'won' | 'lost' | string
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

function getStatusBadge(status: string) {
  switch (status) {
    case 'won':
      return <Badge variant="success">Ganho</Badge>
    case 'lost':
      return <Badge variant="destructive">Perdido</Badge>
    default:
      return <Badge variant="secondary">Aberto</Badge>
  }
}

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: userRes } = await supabase.auth.getUser()
  const userEmail = userRes?.user?.email

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })

  const { data: leadsRaw } = await supabase
    .from('leads')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

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
    <LeadsAppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Leads</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {leadsCount ?? 0} leads no total
            </p>
          </div>
        </div>

        <CreateLeadForm pipelines={pipelines} stages={stages} />

        <Card>
          <CardHeader>
            <CardTitle>Últimos Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {leads.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--foreground)] truncate">
                        {lead.title}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        <ClientDate value={lead.created_at} />
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      {getStatusBadge(lead.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum lead encontrado"
                description="Crie seu primeiro lead usando o formulário acima."
                icon={
                  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </LeadsAppShell>
  )
}
