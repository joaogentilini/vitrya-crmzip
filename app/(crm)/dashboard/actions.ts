'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function completeCampaignTask(taskId: string) {
  if (!taskId) {
    throw new Error('Task id is required')
  }

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
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components podem bloquear set; em Server Actions geralmente funciona.
          }
        },
      },
    }
  )

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    throw new Error('Not authenticated')
  }

  const { error } = await supabase
    .from('property_campaign_tasks')
    .update({ done_at: new Date().toISOString() })
    .eq('id', taskId)
    .is('done_at', null)

  if (error) {
    throw new Error(error.message)
  }
}
