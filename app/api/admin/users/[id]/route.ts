import { createClient } from '@/lib/supabaseServer'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getAdminSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[getAdminSupabase] Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
    throw new Error('Missing Supabase service role configuration')
  }
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('[validateAdminOrGestor] Profile fetch error:', profileError)
    return null
  }

  if (!profile) return null
  if (profile.is_active === false) return null
  if (profile.role !== 'admin' && profile.role !== 'gestor') return null

  return { user, profile }
}

export async function PATCH(
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

    const body = await request.json()
    const { role, is_active, full_name } = body

    const updates: Record<string, unknown> = {}
    const auditDetails: Record<string, unknown> = {}

    if (role !== undefined) {
      if (!['admin', 'gestor', 'corretor'].includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      if (role === 'admin' && authResult.profile.role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can assign admin role' }, { status: 403 })
      }
      updates.role = role
      auditDetails.role_changed = role
    }

    if (is_active !== undefined) {
      if (id === authResult.user.id) {
        return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 400 })
      }
      updates.is_active = is_active
      auditDetails.is_active_changed = is_active
    }

    if (full_name !== undefined) {
      updates.full_name = full_name
      auditDetails.full_name_changed = full_name
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const adminSupabase = await getAdminSupabase()

    const { data: updatedProfile, error } = await adminSupabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[PATCH /api/admin/users/[id]] Error:', error)
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    // Non-blocking audit log - don't fail user update if audit fails
    try {
      const { error: auditError } = await adminSupabase
        .from('user_audit_logs')
        .insert({
          actor_id: authResult.user.id,
          target_user_id: id,
          action: is_active === false ? 'user_deactivated' : 
                  is_active === true ? 'user_activated' : 
                  role ? 'role_changed' : 'user_updated',
          details: auditDetails
        })
      if (auditError) {
        console.warn('[PATCH /api/admin/users/[id]] Audit log failed (non-blocking):', auditError.message)
      }
    } catch (auditErr) {
      console.warn('[PATCH /api/admin/users/[id]] Audit log exception (non-blocking):', auditErr)
    }

    return NextResponse.json({ success: true, user: updatedProfile })
  } catch (err) {
    console.error('[PATCH /api/admin/users/[id]] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
