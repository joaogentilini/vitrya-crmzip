'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabaseServer'
import { runAllAutomations } from '@/lib/automations'

export async function updateAutomationSetting(settingId: string, enabled: boolean) {
  const supabase = await createClient()
  
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Não autenticado')
  
  const userId = userRes.user.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (profile?.role !== 'admin') throw new Error('Apenas administradores')

  const { error } = await supabase
    .from('automation_settings')
    .update({ enabled })
    .eq('id', settingId)

  if (error) throw new Error(error.message)

  revalidatePath('/settings/automations')
}

export async function runAutomations() {
  const supabase = await createClient()
  
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) throw new Error('Não autenticado')
  
  const userId = userRes.user.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (profile?.role !== 'admin') throw new Error('Apenas administradores')

  const results = await runAllAutomations(userId)

  revalidatePath('/leads')
  revalidatePath('/leads/kanban')
  revalidatePath('/dashboard')
  revalidatePath('/agenda')

  return {
    success: true,
    results,
    summary: {
      totalTasksCreated: results.reduce((sum, r) => sum + r.tasksCreated, 0),
      rulesExecuted: results.length,
    }
  }
}
