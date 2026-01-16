import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('[GET /api/debug/me] Auth error:', authError)
      return NextResponse.json({ 
        ok: false,
        user: null,
        profile: null,
        error: 'Auth error',
        details: authError.message
      })
    }
    
    if (!user) {
      return NextResponse.json({ 
        ok: false,
        user: null,
        profile: null,
        error: 'No session'
      })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_e164, role, is_active, created_at, updated_at')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('[GET /api/debug/me] Profile error:', profileError)
      return NextResponse.json({ 
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at
        },
        profile: null,
        profile_error: profileError.message,
        rls_hint: 'Profile not found - RLS may be blocking or profile does not exist'
      })
    }

    return NextResponse.json({ 
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      },
      profile: profile,
      is_blocked: profile?.is_active === false
    })
  } catch (err) {
    console.error('[GET /api/debug/me] Error:', err)
    return NextResponse.json({ 
      ok: false,
      error: 'Internal server error',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
