export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { CatalogsClient } from './CatalogsClient'

interface CatalogItem {
  id: string
  name: string
  is_active: boolean
  position: number
  created_at: string
}

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

  const [typesRes, interestsRes, sourcesRes] = await Promise.all([
    supabase
      .from('lead_types')
      .select('id, name, is_active, position, created_at')
      .order('position', { ascending: true }),
    supabase
      .from('lead_interests')
      .select('id, name, is_active, position, created_at')
      .order('position', { ascending: true }),
    supabase
      .from('lead_sources')
      .select('id, name, is_active, position, created_at')
      .order('position', { ascending: true }),
  ])

  const leadTypes: CatalogItem[] = typesRes.data || []
  const leadInterests: CatalogItem[] = interestsRes.data || []
  const leadSources: CatalogItem[] = sourcesRes.data || []

  return (
    <CatalogsClient
      userEmail={userEmail}
      leadTypes={leadTypes}
      leadInterests={leadInterests}
      leadSources={leadSources}
    />
  )
}
