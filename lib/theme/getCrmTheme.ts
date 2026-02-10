import { createClient } from '@/lib/supabaseServer'

export type ThemeVars = Record<string, string>

export async function getCrmThemeVars(): Promise<ThemeVars> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ui_theme_settings')
    .select('vars')
    .is('tenant_id', null)
    .eq('scope', 'crm')
    .maybeSingle()

  if (error) {
    console.error('getCrmThemeVars error:', error)
    return {}
  }

  const vars = (data?.vars ?? {}) as any
  if (!vars || typeof vars !== 'object') return {}

  const out: ThemeVars = {}
  for (const [k, v] of Object.entries(vars)) {
    if (typeof k === 'string' && k.startsWith('--') && typeof v === 'string') out[k] = v
  }
  return out
}
