export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { CatalogsClient } from './CatalogsClient'
import { ensureUserProfile } from '@/lib/auth'

interface CatalogItem {
  id: string
  name: string
  is_active: boolean
  position: number
  created_at: string
}

export default async function CatalogsPage() {
  const profile = await ensureUserProfile()
  if (!profile) {
    redirect('/')
  }
  
  if (profile && profile.is_active === false) {
    redirect('/blocked')
  }

  if (profile.role !== 'admin') {
    redirect('/leads')
  }

  const userEmail = profile.email
  const supabase = await createClient()

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
