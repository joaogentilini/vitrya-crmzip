import { createClient } from '@/lib/supabaseServer'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getAdminSupabase() {
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

async function validateAdminOrGestor(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) return null
  if (profile.role !== 'admin' && profile.role !== 'gestor') return null

  return { user, profile }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const authResult = await validateAdminOrGestor(supabase)
    
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = await getAdminSupabase()

    const { data: targetProfile } = await adminSupabase
      .from('profiles')
      .select('email')
      .eq('id', id)
      .single()

    if (!targetProfile?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { error } = await adminSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: targetProfile.email
    })

    if (error) {
      console.error('[POST /api/admin/users/[id]/reset-password] Error:', error)
      return NextResponse.json({ error: 'Failed to generate reset link' }, { status: 500 })
    }

    await adminSupabase
      .from('user_audit_logs')
      .insert({
        actor_id: authResult.user.id,
        target_user_id: id,
        action: 'password_reset_requested',
        details: { email: targetProfile.email }
      })

    return NextResponse.json({ 
      success: true, 
      message: 'Password reset email sent'
    })
  } catch (err) {
    console.error('[POST /api/admin/users/[id]/reset-password] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
