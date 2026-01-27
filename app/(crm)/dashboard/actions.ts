'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function completeCampaignTask(taskId: string) {
  if (!taskId) {
    throw new Error('Task id is required')
  }

  // Next 15/16: cookies() é async
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
            cookiesToSet.forEach(({ name, value, options }: any) => {
              ;(cookieStore as any).set(name, value, options)
            })
          } catch {
            // Server Actions/Components: ok ignorar
          }
        },
      },
    }
  )

  const isMissingColumnError = (error: { code?: string; message?: string }) => {
    if (error?.code === '42703') return true
    if (!error?.message) return false
    return error.message.toLowerCase().includes('column') && error.message.toLowerCase().includes('does not exist')
  }

  const now = new Date().toISOString()

  const tryUpdate = async (payload: Record<string, any>, requireNullDoneAt = false) => {
    let query = supabase.from('property_campaign_tasks').update(payload).eq('id', taskId)
    if (requireNullDoneAt) {
      query = query.is('done_at', null)
    }
    const { error } = await query
    if (!error) return true
    if (isMissingColumnError(error)) return false
    throw new Error(error.message)
  }

  if (await tryUpdate({ done_at: now }, true)) {
    return { ok: true }
  }
  if (await tryUpdate({ done: true })) {
    return { ok: true }
  }
  if (await tryUpdate({ status: 'done' })) {
    return { ok: true }
  }

  throw new Error('No compatible column found to complete task')
}
