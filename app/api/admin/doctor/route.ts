import { createClient } from '@/lib/supabaseServer'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET() {
  const log = createLogger('/api/admin/doctor')
  
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      log.warn('Unauthorized access attempt')
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    
    log.context.userId = user.id
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()
    
    if (!profile || !profile.is_active) {
      log.warn('Inactive user access attempt')
      return NextResponse.json({ error: 'Usuário inativo' }, { status: 403 })
    }
    
    if (profile.role !== 'admin' && profile.role !== 'gestor') {
      log.warn('Non-admin access attempt', { role: profile.role })
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
    }
    
    log.info('Running doctor check')
    
    const adminSupabase = createAdminClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    
    const { data: doctorResult, error: doctorError } = await adminSupabase
      .rpc('vitrya_doctor')
    
    if (doctorError) {
      log.error('Doctor function error', doctorError)
      
      if (doctorError.message.includes('function') && doctorError.message.includes('does not exist')) {
        return NextResponse.json({
          ok: false,
          error: 'Função vitrya_doctor() não encontrada. Execute a migration 20260116_1500_doctor_function.sql',
          requestId: log.requestId
        }, { status: 500 })
      }
      
      return NextResponse.json({
        ok: false,
        error: 'Erro ao executar diagnóstico',
        details: doctorError.message,
        requestId: log.requestId
      }, { status: 500 })
    }
    
    log.info('Doctor check completed', { ok: doctorResult?.ok })
    
    return NextResponse.json({
      ...doctorResult,
      requestId: log.requestId
    })
  } catch (err) {
    log.error('Unexpected error', err)
    return NextResponse.json({
      ok: false,
      error: 'Erro interno do servidor',
      requestId: log.requestId
    }, { status: 500 })
  }
}
