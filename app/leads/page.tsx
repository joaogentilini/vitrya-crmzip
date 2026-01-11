export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { CreateLeadForm } from './CreateLeadForm'

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

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: userRes } = await supabase.auth.getUser()
  const userId = userRes?.user?.id

  const { count: leadsCount, error: countErr } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
  if (countErr) console.error('[LeadsPage] countErr:', countErr)

  const { data: leadsRaw, error: leadsErr } = await supabase
    .from('leads')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (leadsErr) console.error('[LeadsPage] leadsErr:', leadsErr)

  const leads = (leadsRaw ?? []) as LeadRow[]

  const { data: pipelinesRaw, error: pipelinesErr } = await supabase
    .from('pipelines')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })
  if (pipelinesErr) console.error('[LeadsPage] pipelinesErr:', pipelinesErr)

  const pipelines = (pipelinesRaw ?? []) as PipelineRow[]

  const { data: stagesRaw, error: stagesErr } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id, name, position')
    .order('position', { ascending: true })
  if (stagesErr) console.error('[LeadsPage] stagesErr:', stagesErr)

  const stages = (stagesRaw ?? []) as StageRow[]

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Leads</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        <div>
          <strong>Total:</strong> {leadsCount ?? 0}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Usuário: {userId ?? '(não autenticado)'}
        </div>
      </div>

      <CreateLeadForm pipelines={pipelines} stages={stages} />

      <div style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Últimos leads</h3>
        {leads.length ? (
          <ul style={{ paddingLeft: 18 }}>
            {leads.map((l: LeadRow) => (
              <li key={l.id}>
                {l.title} — <span style={{ opacity: 0.7 }}>{l.status}</span>{' '}
                <span style={{ opacity: 0.5, fontSize: 12 }}>
                  ({new Date(l.created_at).toLocaleString()})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ opacity: 0.7 }}>Nenhum lead encontrado.</p>
        )}
      </div>

      <p style={{ marginTop: 16, opacity: 0.7 }}>
        Se der erro, veja o Terminal do <code>npm run dev</code>.
      </p>
    </div>
  )
}
