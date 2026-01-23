export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { DoctorClient } from './DoctorClient'
import { ensureUserProfile } from '@/lib/auth'

export default async function DoctorPage() {
  const profile = await ensureUserProfile()
  
  if (!profile) {
    redirect('/')
  }
  
  if (profile.is_active === false) {
    redirect('/blocked')
  }
  
  if (profile.role !== 'admin' && profile.role !== 'gestor') {
    redirect('/dashboard')
  }
  
  return <DoctorClient userEmail={profile.email ?? undefined} />
}
