'use server'

import { createClient } from '@/lib/supabaseServer'
import { requireActiveUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function upsertCrmTheme(vars: Record<string, string>) {
  await requireActiveUser()
  const supabase = await createClient()

  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars || {})) {
    if (typeof k === 'string' && k.startsWith('--') && typeof v === 'string' && v.trim()) {
      clean[k] = v.trim()
    }
  }

  const { error } = await supabase.from('ui_theme_settings').upsert(
    { tenant_id: null, scope: 'crm', vars: clean },
    { onConflict: 'tenant_id,scope' }
  )

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard')
}
