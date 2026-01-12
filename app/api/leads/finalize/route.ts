import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const leadId = body?.leadId as string
    const status = body?.status as 'won' | 'lost'

    console.log('[finalize-debug] request body:', { leadId, status })

    if (!leadId) {
      console.log('[finalize-debug] FAIL: missing leadId')
      return NextResponse.json({ error: 'leadId é obrigatório' }, { status: 400 })
    }
    if (status !== 'won' && status !== 'lost') {
      console.log('[finalize-debug] FAIL: invalid status:', status)
      return NextResponse.json({ error: 'status inválido' }, { status: 400 })
    }

    const supabase = await createClient()

    // 0) Garantir usuário autenticado
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    const user = authData?.user
    console.log('[finalize-debug] userId:', user?.id ?? 'null', 'authErr:', authErr?.message ?? 'none')
    if (authErr || !user) {
      console.log('[finalize-debug] FAIL: not authenticated')
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // 1) Buscar lead atual (com ownership)
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, user_id, pipeline_id, stage_id, status')
      .eq('id', leadId)
      .single()

    console.log('[finalize-debug] lead:', lead, 'leadErr:', leadErr?.message ?? 'none')

    if (leadErr) {
      console.log('[finalize-debug] FAIL: leadErr:', leadErr.message)
      return NextResponse.json({ error: leadErr.message }, { status: 400 })
    }
    if (!lead) {
      console.log('[finalize-debug] FAIL: lead not found')
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }

    // Ownership check (defesa em profundidade)
    console.log('[finalize-debug] ownership check: lead.user_id=', lead.user_id, 'user.id=', user.id, 'match=', lead.user_id === user.id)
    if (lead.user_id !== user.id) {
      console.log('[finalize-debug] FAIL: access denied (ownership)')
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    if (lead.status !== 'open') {
      console.log('[finalize-debug] FAIL: lead already finalized, status=', lead.status)
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

    console.log('[finalize-debug] lastStage:', lastStage, 'stageErr:', stageErr?.message ?? 'none')

    if (stageErr) {
      console.log('[finalize-debug] FAIL: stageErr:', stageErr.message)
      return NextResponse.json({ error: stageErr.message }, { status: 400 })
    }
    if (!lastStage) {
      console.log('[finalize-debug] FAIL: lastStage not found for pipeline_id=', lead.pipeline_id)
      return NextResponse.json({ error: 'Último stage não encontrado para este pipeline' }, { status: 400 })
    }

    // 3) Update lead (status + stage)
    const { error: updErr } = await supabase
      .from('leads')
      .update({ status, stage_id: lastStage.id })
      .eq('id', leadId)

    console.log('[finalize-debug] update result: updErr=', updErr?.message ?? 'none')

    if (updErr) {
      console.log('[finalize-debug] FAIL: updErr:', updErr.message)
      return NextResponse.json({ error: updErr.message }, { status: 400 })
    }

    // 4) Log histórico
    const { error: logErr } = await supabase.from('lead_stage_changes').insert({
      lead_id: leadId,
      pipeline_id: lead.pipeline_id,
      from_stage_id: lead.stage_id,
      to_stage_id: lastStage.id,
    })

    console.log('[finalize-debug] stage change log: logErr=', logErr?.message ?? 'none')

    if (logErr) {
      console.log('[finalize-debug] FAIL: logErr:', logErr.message)
      return NextResponse.json({ error: logErr.message }, { status: 400 })
    }

    console.log('[finalize-debug] SUCCESS: lead finalized')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.log('[finalize-debug] EXCEPTION:', e?.message ?? 'unknown')
    return NextResponse.json({ error: e?.message ?? 'Erro interno' }, { status: 500 })
  }
}
