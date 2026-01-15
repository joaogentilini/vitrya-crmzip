import { createClient } from '@/lib/supabaseServer'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

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

export async function GET() {
  try {
    const supabase = await createClient()
    const authResult = await validateAdminOrGestor(supabase)
    
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_e164, role, is_active, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/admin/users] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    return NextResponse.json({ users })
  } catch (err) {
    console.error('[GET /api/admin/users] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const authResult = await validateAdminOrGestor(supabase)
    
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email, password, full_name, phone_e164, role } = body

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['admin', 'gestor', 'corretor'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (role === 'admin' && authResult.profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create admin users' }, { status: 403 })
    }

    const adminSupabase = await getAdminSupabase()

    const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
      console.error('[POST /api/admin/users] Auth error:', authError)
      let errorMsg = authError.message
      if (authError.message.includes('already been registered')) {
        errorMsg = 'Este email já está cadastrado'
      } else if (authError.message.includes('password')) {
        errorMsg = 'Senha inválida - use no mínimo 6 caracteres'
      }
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    if (!authUser.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    const { error: profileError } = await adminSupabase
      .from('profiles')
      .upsert({
        id: authUser.user.id,
        full_name,
        email,
        phone_e164: phone_e164 || null,
        role,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })

    if (profileError) {
      console.error('[POST /api/admin/users] Profile error:', profileError)
      await adminSupabase.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
    }

    await adminSupabase
      .from('user_audit_logs')
      .insert({
        actor_id: authResult.user.id,
        target_user_id: authUser.user.id,
        action: 'user_created',
        details: { role, email }
      })

    return NextResponse.json({ 
      success: true, 
      user: {
        id: authUser.user.id,
        email,
        full_name,
        role
      }
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/admin/users] Error:', err)
    
    if (errorMessage.includes('Missing Supabase service role')) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Configuração do servidor incompleta', 
        details: 'SUPABASE_SERVICE_ROLE_KEY não configurada' 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error',
      details: errorMessage
    }, { status: 500 })
  }
}
