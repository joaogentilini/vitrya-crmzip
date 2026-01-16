import { createClient } from '@/lib/supabaseServer'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'

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

async function validateAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('[validateAdmin] Profile fetch error:', profileError)
    return null
  }

  if (!profile) return null
  if (profile.is_active === false) return null
  if (profile.role !== 'admin') return null

  return { user, profile }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const authResult = await validateAdmin(supabase)
    
    if (!authResult) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, created_at, updated_at')
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
  const log = createLogger('/api/admin/users', undefined)
  log.info('Request received')
  
  // Early check for service role key
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log.error('SUPABASE_SERVICE_ROLE_KEY not configured')
    return NextResponse.json({ 
      error: 'Configuração do servidor incompleta',
      details: 'Service role key ausente. Configure SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente.',
      requestId: log.requestId
    }, { status: 500 })
  }

  try {
    const supabase = await createClient()
    const authResult = await validateAdmin(supabase)
    
    log.context.userId = authResult?.user.id
    log.info('Auth validated', { role: authResult?.profile.role })
    
    if (!authResult) {
      log.warn('Non-admin access attempt')
      return NextResponse.json({ 
        error: 'Apenas administradores podem criar usuários',
        requestId: log.requestId
      }, { status: 403 })
    }

    const body = await request.json()
    log.debug('Request body', { email: body.email, role: body.role, full_name: body.full_name })
    const { email, password, full_name, phone_e164, role } = body

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ 
        error: 'Preencha todos os campos obrigatórios',
        requestId: log.requestId
      }, { status: 400 })
    }

    if (!['admin', 'gestor', 'corretor'].includes(role)) {
      return NextResponse.json({ 
        error: 'Cargo inválido',
        requestId: log.requestId
      }, { status: 400 })
    }

    const adminSupabase = await getAdminSupabase()

    const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
      log.error('Auth user creation failed', authError)
      let errorMsg = authError.message
      if (authError.message.includes('already been registered')) {
        errorMsg = 'Este email já está cadastrado'
      } else if (authError.message.includes('password')) {
        errorMsg = 'Senha inválida - use no mínimo 6 caracteres'
      }
      return NextResponse.json({ 
        error: errorMsg,
        requestId: log.requestId
      }, { status: 400 })
    }

    if (!authUser.user) {
      log.error('Auth user creation returned null')
      return NextResponse.json({ 
        error: 'Falha ao criar usuário',
        requestId: log.requestId
      }, { status: 500 })
    }

    const profilePayload: Record<string, unknown> = {
      id: authUser.user.id,
      full_name,
      email,
      role,
      is_active: true,
      updated_at: new Date().toISOString()
    }

    const { error: profileError } = await adminSupabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })

    if (profileError) {
      log.error('Profile upsert failed', profileError)
      // Rollback: delete auth user if profile creation fails
      await adminSupabase.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json({ 
        error: 'Falha ao criar perfil do usuário',
        requestId: log.requestId
      }, { status: 500 })
    }

    log.info('Profile created', { userId: authUser.user.id })

    // Non-blocking audit log - don't fail user creation if audit fails
    try {
      const { error: auditError } = await adminSupabase
        .from('user_audit_logs')
        .insert({
          actor_id: authResult.user.id,
          target_user_id: authUser.user.id,
          action: 'user_created',
          details: { role, email }
        })
      if (auditError) {
        log.warn('Audit log failed (non-blocking)', auditError)
      }
    } catch (auditErr) {
      log.warn('Audit log exception (non-blocking)', auditErr)
    }

    log.info('User created successfully', { userId: authUser.user.id })

    return NextResponse.json({ 
      success: true, 
      user: {
        id: authUser.user.id,
        email,
        full_name,
        role
      },
      requestId: log.requestId
    })
  } catch (err) {
    log.error('Unexpected error', err)
    
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    if (errorMessage.includes('Missing Supabase service role')) {
      return NextResponse.json({ 
        error: 'Configuração do servidor incompleta. Contate o administrador.',
        requestId: log.requestId
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      requestId: log.requestId
    }, { status: 500 })
  }
}
