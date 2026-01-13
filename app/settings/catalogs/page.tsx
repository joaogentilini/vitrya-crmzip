export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { CatalogsClient } from './CatalogsClient'

interface CatalogItem {
  id: string
  name: string
  is_active: boolean
  position: number
  created_at: string
}

async function fetchCatalog(baseUrl: string, endpoint: string, cookie: string): Promise<CatalogItem[]> {
  try {
    const resp = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Cookie: cookie },
      cache: 'no-store',
    })
    if (!resp.ok) {
      console.error(`[CatalogsPage] Failed to fetch ${endpoint}:`, await resp.text())
      return []
    }
    const json = await resp.json()
    return json.data || []
  } catch (err) {
    console.error(`[CatalogsPage] Error fetching ${endpoint}:`, err)
    return []
  }
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

  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:5000'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${protocol}://${host}`
  const cookie = headersList.get('cookie') || ''

  const [leadTypes, leadInterests, leadSources] = await Promise.all([
    fetchCatalog(baseUrl, '/api/catalogs/lead-types', cookie),
    fetchCatalog(baseUrl, '/api/catalogs/lead-interests', cookie),
    fetchCatalog(baseUrl, '/api/catalogs/lead-sources', cookie),
  ])

  console.log('[CatalogsPage] Loaded catalogs:', {
    types: leadTypes.length,
    interests: leadInterests.length,
    sources: leadSources.length,
  })

  return (
    <CatalogsClient
      userEmail={userEmail}
      leadTypes={leadTypes}
      leadInterests={leadInterests}
      leadSources={leadSources}
    />
  )
}
