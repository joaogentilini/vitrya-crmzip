'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

async function supabaseServer() {
  // ✅ Next 15/16: cookies() retorna Promise
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
            // Server Action/Server Component - ignore
          }
        },
      },
    }
  )
}

export async function setTaskDone(input: { taskId: string; done: boolean }) {
  if (!input?.taskId) throw new Error('taskId obrigatório')

  const supabase = await supabaseServer()

  const { error } = await supabase
    .from('property_campaign_tasks')
    .update({
      done_at: input.done ? new Date().toISOString() : null,
    })
    .eq('id', input.taskId)

  if (error) throw new Error(error.message)
}
