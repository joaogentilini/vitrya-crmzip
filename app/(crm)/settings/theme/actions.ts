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

  const { data: existingRows, error: fetchError } = await supabase
    .from('ui_theme_settings')
    .select('id')
    .is('tenant_id', null)
    .eq('scope', 'crm')

  if (fetchError) throw new Error(fetchError.message)

  const hasRows = (existingRows?.length ?? 0) > 0

  const { error } = hasRows
    ? await supabase
        .from('ui_theme_settings')
        .update({ vars: clean })
        .is('tenant_id', null)
        .eq('scope', 'crm')
    : await supabase.from('ui_theme_settings').insert({ tenant_id: null, scope: 'crm', vars: clean })

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard')
}
