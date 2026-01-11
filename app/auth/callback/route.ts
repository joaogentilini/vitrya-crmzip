import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/leads'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Redireciona para a rota desejada (ex: /leads ou /auth/reset)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Fallback em caso de erro no exchange
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
