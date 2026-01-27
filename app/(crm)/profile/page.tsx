export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'
import { ensureUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import { ProfileClient } from './ProfileClient'

export default async function ProfilePage() {
  const profile = await ensureUserProfile()

  if (!profile) {
    redirect('/')
  }

  if (profile.is_active === false) {
    redirect('/blocked')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(
      `
      id,
      full_name,
      email,
      phone,
      phone_e164,
      public_name,
      creci,
      tagline,
      bio,
      avatar_url,
      instagram_url,
      facebook_url,
      tiktok_url,
      youtube_url,
      linkedin_url,
      website_url
    `
    )
    .eq('id', profile.id)
    .maybeSingle()

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Perfil público</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">
          Não foi possível carregar seu perfil agora. Tente novamente.
        </p>
      </div>
    )
  }

  return (
    <ProfileClient profile={data} />
  )
}
