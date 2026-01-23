export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'
import { ensureUserProfile } from '@/lib/auth'
import { PerfilClient } from './PerfilClient'

export default async function PerfilPage() {
  const profile = await ensureUserProfile()
  
  if (!profile) {
    redirect('/')
  }
  
  if (profile.is_active === false) {
    redirect('/blocked')
  }

  return (
    <PerfilClient
      userId={profile.id}
      userEmail={profile.email}
      initialFullName={profile.full_name}
      initialPhone={profile.phone_e164}
      role={profile.role}
    />
  )
}
