import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function POST() {
  const supabase = await createClient()

  // 1. Check auth
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return NextResponse.json({
      ok: false,
      error: 'AUTH_ERROR',
      message: 'Not authenticated',
      details: authError
    }, { status: 401 })
  }
  const userId = userRes.user.id

  // 2. Find default pipeline
  const { data: pipeline, error: pipelineError } = await supabase
    .from('pipelines')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (pipelineError) {
    return NextResponse.json({
      ok: false,
      error: 'PIPELINE_ERROR',
      message: 'Error fetching pipeline',
      details: pipelineError
    }, { status: 500 })
  }

  if (!pipeline) {
    return NextResponse.json({
      ok: false,
      error: 'NO_PIPELINE',
      message: 'No pipelines found. Create a pipeline first.'
    }, { status: 400 })
  }

  // 3. Find initial stage
  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id, name, position')
    .eq('pipeline_id', pipeline.id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (stageError) {
    return NextResponse.json({
      ok: false,
      error: 'STAGE_ERROR',
      message: 'Error fetching stage',
      details: stageError
    }, { status: 500 })
  }

  if (!stage) {
    return NextResponse.json({
      ok: false,
      error: 'NO_STAGE',
      message: `No stages found for pipeline "${pipeline.name}". Create stages first.`
    }, { status: 400 })
  }

  // 4. Insert test lead
  const timestamp = new Date().toISOString().slice(11, 19)
  const payload = {
    title: `DEBUG LEAD ${timestamp}`,
    status: 'open',
    pipeline_id: pipeline.id,
    stage_id: stage.id,
    user_id: userId,
    created_by: userId,
    assigned_to: userId,
    owner_user_id: userId,
    client_name: `Debug Client ${timestamp}`,
  }

  const { data: lead, error: insertError } = await supabase
    .from('leads')
    .insert(payload)
    .select('id, title, status, pipeline_id, stage_id, owner_user_id, created_at')
    .single()

  if (insertError) {
    return NextResponse.json({
      ok: false,
      error: 'INSERT_ERROR',
      message: insertError.message,
      code: insertError.code,
      details: insertError
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    lead: {
      id: lead.id,
      title: lead.title,
      status: lead.status,
      pipeline_id: lead.pipeline_id,
      stage_id: lead.stage_id,
      owner_user_id: lead.owner_user_id,
      created_at: lead.created_at
    },
    resolved: {
      pipeline: pipeline.name,
      stage: stage.name
    }
  })
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to create a debug lead',
    usage: 'curl -X POST -H "Cookie: <session_cookie>" /api/debug/create-lead'
  })
}
