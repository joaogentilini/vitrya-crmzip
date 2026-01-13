export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { CatalogsClient } from './CatalogsClient'

export default async function CatalogsPage() {
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

  const { data: leadTypes } = await supabase
    .from('lead_types')
    .select('*')
    .order('position', { ascending: true })

  const { data: leadInterests } = await supabase
    .from('lead_interests')
    .select('*')
    .order('position', { ascending: true })

  const { data: leadSources } = await supabase
    .from('lead_sources')
    .select('*')
    .order('position', { ascending: true })

  return (
    <CatalogsClient
      userEmail={userEmail}
      leadTypes={leadTypes || []}
      leadInterests={leadInterests || []}
      leadSources={leadSources || []}
    />
  )
}
