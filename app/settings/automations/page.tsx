export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { AutomationsClient } from './AutomationsClient'
import { ensureUserProfile } from '@/lib/auth'

export default async function AutomationsPage() {
  const profile = await ensureUserProfile()
  if (!profile) {
    redirect('/')
  }
  
  if (!profile.is_active) {
    redirect('/blocked')
  }

  if (profile.role !== 'admin') {
    redirect('/leads')
  }

  const userEmail = profile.email
  const supabase = await createClient()

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
