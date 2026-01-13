import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { runAllAutomations } from '@/lib/automations'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const automationSecret = process.env.AUTOMATIONS_SECRET
  
  if (automationSecret && authHeader === `Bearer ${automationSecret}`) {
    const results = await runAllAutomations('system')
    return NextResponse.json({ success: true, results })
  }

  const supabase = await createClient()
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  
  if (authError || !userRes?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = userRes.user.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
  }

  const results = await runAllAutomations(userId)

  return NextResponse.json({ 
    success: true, 
    results,
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
