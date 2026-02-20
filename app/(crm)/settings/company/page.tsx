export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'

import { ensureUserProfile } from '@/lib/auth'
import { getCompanySettingsAdmin } from '@/lib/companySettings'

import { CompanySettingsClient } from './CompanySettingsClient'

export default async function CompanySettingsPage() {
  const profile = await ensureUserProfile()
  if (!profile) redirect('/')
  if (profile.is_active === false) redirect('/blocked')
  if (profile.role !== 'admin' && profile.role !== 'gestor') redirect('/dashboard')

  const settings = await getCompanySettingsAdmin()

  return <CompanySettingsClient initialSettings={settings} />
}
