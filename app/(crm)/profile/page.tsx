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
  const baseSelect = `
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

  const extendedSelect = `
    ${baseSelect},
    avatar_focus_x,
    avatar_focus_y,
    avatar_zoom
  `

  const initialResult = await supabase
    .from('profiles')
    .select(extendedSelect)
    .eq('id', profile.id)
    .maybeSingle()
  let data = initialResult.data as Record<string, unknown> | null
  let error = initialResult.error

  if (error && /avatar_focus_x|avatar_focus_y|avatar_zoom|column/i.test(error.message || '')) {
    const fallback = await supabase
      .from('profiles')
      .select(baseSelect)
      .eq('id', profile.id)
      .maybeSingle()

    data = fallback.data as Record<string, unknown> | null
    error = fallback.error
  }

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

  const raw = data as Record<string, unknown>

  const normalizedData = {
    id: String(raw.id ?? profile.id),
    full_name: (raw.full_name as string | null) ?? null,
    email: (raw.email as string | null) ?? null,
    phone: (raw.phone as string | null) ?? null,
    phone_e164: (raw.phone_e164 as string | null) ?? null,
    public_name: (raw.public_name as string | null) ?? null,
    creci: (raw.creci as string | null) ?? null,
    tagline: (raw.tagline as string | null) ?? null,
    bio: (raw.bio as string | null) ?? null,
    avatar_url: (raw.avatar_url as string | null) ?? null,
    instagram_url: (raw.instagram_url as string | null) ?? null,
    facebook_url: (raw.facebook_url as string | null) ?? null,
    tiktok_url: (raw.tiktok_url as string | null) ?? null,
    youtube_url: (raw.youtube_url as string | null) ?? null,
    linkedin_url: (raw.linkedin_url as string | null) ?? null,
    website_url: (raw.website_url as string | null) ?? null,
    avatar_focus_x: (raw.avatar_focus_x as number | null) ?? 50,
    avatar_focus_y: (raw.avatar_focus_y as number | null) ?? 50,
    avatar_zoom: (raw.avatar_zoom as number | null) ?? 1,
  }

  return <ProfileClient profile={normalizedData} />
}
