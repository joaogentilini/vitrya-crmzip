import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const leadId = body?.leadId as string
    const status = body?.status as 'won' | 'lost'

    if (!leadId) {
      return NextResponse.json({ error: 'leadId é obrigatório' }, { status: 400 })
    }
    if (status !== 'won' && status !== 'lost') {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 })
    }

    const supabase = await createClient()

    // 0) Garantir usuário autenticado
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    const user = authData?.user
    if (authErr || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // 1) Buscar lead atual (com ownership)
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, user_id, pipeline_id, stage_id, status')
      .eq('id', leadId)
      .single()

    if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 400 })
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    // Ownership check (defesa em profundidade)
    if (lead.user_id !== user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    if (lead.status !== 'open') {
      return NextResponse.json({ error: 'Lead já finalizado' }, { status: 400 })
    }

    // 2) Último stage do pipeline
    const { data: lastStage, error: stageErr } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', lead.pipeline_id)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    if (stageErr) return NextResponse.json({ error: stageErr.message }, { status: 400 })
    if (!lastStage) {
      return NextResponse.json({ error: 'Último stage não encontrado para este pipeline' }, { status: 400 })
    }

    // 3) Update lead (status + stage)
    const { error: updErr } = await supabase
      .from('leads')
      .update({ status, stage_id: lastStage.id })
      .eq('id', leadId)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    // 4) Log histórico
    const { error: logErr } = await supabase.from('lead_stage_changes').insert({
      lead_id: leadId,
      pipeline_id: lead.pipeline_id,
      from_stage_id: lead.stage_id,
      to_stage_id: lastStage.id,
    })

    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro interno' }, { status: 500 })
  }
}
