import { createClient } from '@/lib/supabaseServer'

export type ThemeVars = Record<string, string>

export const CRM_THEME_BASE_VARS: ThemeVars = {
  '--background': '#FAFAFA',
  '--foreground': '#171A21',
  '--card': '#ffffff',
  '--card-foreground': '#171A21',
  '--popover': '#ffffff',
  '--popover-foreground': '#171A21',
  '--primary': '#FF681F',
  '--primary-foreground': '#ffffff',
  '--secondary': '#294487',
  '--secondary-foreground': '#ffffff',
  '--muted': '#f1f5f9',
  '--muted-foreground': '#64748b',
  '--accent': '#f1f5f9',
  '--accent-foreground': '#171A21',
  '--destructive': '#dc2626',
  '--destructive-foreground': '#ffffff',
  '--success': '#16a34a',
  '--success-foreground': '#ffffff',
  '--warning': '#f59e0b',
  '--warning-foreground': '#171A21',
  '--info': '#17BEBB',
  '--info-foreground': '#ffffff',
  '--border': '#e2e8f0',
  '--input': '#e2e8f0',
  '--ring': '#FF681F',
  '--sidebar-bg': '#171A21',
  '--sidebar-foreground': '#f8fafc',
  '--sidebar-muted': 'rgba(255, 255, 255, 0.5)',
  '--sidebar-hover': 'rgba(255, 255, 255, 0.1)',
  '--sidebar-active': '#FF681F',
  '--sidebar-active-erp': 'rgba(59,130,246,0.85)',
  '--sidebar-active-current': 'rgba(255,104,31,0.85)',
  '--topbar-bg': 'rgba(255,255,255,0.82)',
}

export async function getCrmThemeVars(): Promise<ThemeVars> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ui_theme_settings')
    .select('vars')
    .is('tenant_id', null)
    .eq('scope', 'crm')
    .limit(1)

  if (error) {
    console.error('getCrmThemeVars error:', error)
    return { ...CRM_THEME_BASE_VARS }
  }

  const vars = (data?.[0]?.vars ?? {}) as any
  if (!vars || typeof vars !== 'object') return { ...CRM_THEME_BASE_VARS }

  const out: ThemeVars = { ...CRM_THEME_BASE_VARS }
  for (const [k, v] of Object.entries(vars)) {
    if (typeof k === 'string' && k.startsWith('--') && typeof v === 'string') out[k] = v
  }
  return out
}
