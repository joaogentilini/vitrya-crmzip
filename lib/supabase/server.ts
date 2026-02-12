import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function isRefreshTokenNotFound(err: unknown) {
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''

  return (
    msg.includes('Invalid Refresh Token') ||
    msg.includes('Refresh Token Not Found') ||
    msg.includes('refresh_token_not_found')
  )
}

/**
 * Server-first (cookies).
 * - Não quebra render quando refresh token não existe.
 */
export async function createClient() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Pode falhar em alguns contextos (RSC). Ignorar para não quebrar render.
          }
        },
      },
    }
  )

  return supabase
}

/**
 * Use isso no lugar de supabase.auth.getSession() em server components/actions
 * quando você quer estabilidade total.
 */
export async function getSessionSafe() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      if (isRefreshTokenNotFound(error)) return { session: null }
      return { session: null }
    }

    return { session: data.session ?? null }
  } catch (err) {
    if (isRefreshTokenNotFound(err)) return { session: null }
    return { session: null }
  }
}

/**
 * SignOut safe (não quebra se já estiver sem sessão)
 */
export async function signOutSafe() {
  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.signOut()
    if (error && !isRefreshTokenNotFound(error)) {
      // não joga erro — só retorna false
      return false
    }
    return true
  } catch (err) {
    if (isRefreshTokenNotFound(err)) return true
    return false
  }
}
