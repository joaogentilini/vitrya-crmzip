import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { runAllAutomations } from '@/lib/automations'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const automationSecret = process.env.AUTOMATIONS_SECRET

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    
    if (!automationSecret) {
      console.error('[api/automations/run] AUTOMATIONS_SECRET not configured')
      return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 })
    }

    if (token !== automationSecret) {
      console.error('[api/automations/run] Invalid Bearer token')
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 })
    }

    console.log('[api/automations/run] Authenticated via Bearer token')
    const results = await runAllAutomations('system')

    return NextResponse.json({
      ok: true,
      auth: 'secret',
      result: results,
      summary: {
        totalTasksCreated: results.reduce((sum, r) => sum + r.tasksCreated, 0),
        rulesExecuted: results.length,
      }
    })
  }

  let supabase
  try {
    supabase = await createClient()
  } catch (err) {
    console.error('[api/automations/run] Failed to create Supabase client:', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }

  let userId: string
  try {
    const { data: userRes, error: authError } = await supabase.auth.getUser()
    
    if (authError || !userRes?.user) {
      console.error('[api/automations/run] Session auth failed:', authError?.message)
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    userId = userRes.user.id
  } catch (err) {
    console.error('[api/automations/run] Auth exception:', err)
    return NextResponse.json({ ok: false, error: 'Auth failed' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (profile?.role !== 'admin') {
    console.error('[api/automations/run] User not admin:', userId)
    return NextResponse.json({ ok: false, error: 'Forbidden - Admin only' }, { status: 403 })
  }

  console.log('[api/automations/run] Authenticated via session (admin):', userId)
  const results = await runAllAutomations(userId)

  return NextResponse.json({ 
    ok: true,
    auth: 'session',
    result: results,
    summary: {
      totalTasksCreated: results.reduce((sum, r) => sum + r.tasksCreated, 0),
      rulesExecuted: results.length,
    }
  })
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST to run automations',
    endpoint: '/api/automations/run'
  })
}
