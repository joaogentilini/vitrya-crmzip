'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

async function supabaseServer() {
  // Next 15/16: cookies() é async
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              (cookieStore as any).set(name, value, options)
            )
          } catch {
            // Server Actions/Components: ok ignorar
          }
        },
      },
    }
  )
}

export async function completeCampaignTask(taskId: string) {
  const supabase = await supabaseServer()

  const { error } = await supabase
    .from('property_campaign_tasks')
    .update({ done_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) throw new Error(error.message)
}

export async function reopenCampaignTask(taskId: string) {
  const supabase = await supabaseServer()

  const { error } = await supabase
    .from('property_campaign_tasks')
    .update({ done_at: null })
    .eq('id', taskId)

  if (error) throw new Error(error.message)
}
