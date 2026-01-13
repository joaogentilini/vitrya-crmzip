export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { AutomationsClient } from './AutomationsClient'

export default async function AutomationsPage() {
  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    redirect('/')
  }

  const userId = userRes.user.id
  const userEmail = userRes.user.email

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/leads')
  }

  const { data: settings } = await supabase
    .from('automation_settings')
    .select('*')
    .order('key')

  return (
    <AutomationsClient
      userEmail={userEmail}
      settings={settings || []}
    />
  )
}
