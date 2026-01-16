import { createBrowserClient } from '@supabase/ssr'

const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: isProduction
    }
  }
)
