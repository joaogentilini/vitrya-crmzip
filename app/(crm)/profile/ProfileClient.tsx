'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface ProfileData {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  phone_e164: string | null
  public_name: string | null
  creci: string | null
  tagline: string | null
  bio: string | null
  avatar_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  tiktok_url: string | null
  youtube_url: string | null
  linkedin_url: string | null
  website_url: string | null
  avatar_focus_x: number | null
  avatar_focus_y: number | null
  avatar_zoom: number | null
}

interface ProfileClientProps {
  profile: ProfileData
}

const AVATAR_BUCKET = 'broker-avatars'
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function normalizeText(value: string) {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function getInitials(name: string | null | undefined) {
  const safe = (name || '').trim()
  if (!safe) return 'CR'
  const parts = safe.split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('')
}

function getFileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && fromName.length <= 5) return fromName
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

function extractCurrentAvatarPath(avatarUrl: string | null | undefined, userId: string): string | null {
  if (!avatarUrl) return null
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`
  const index = avatarUrl.indexOf(marker)
  if (index === -1) return null

  const encodedPath = avatarUrl.slice(index + marker.length).split('?')[0]
  const decodedPath = decodeURIComponent(encodedPath)
  if (!decodedPath.startsWith(`${userId}/`)) return null

  return decodedPath
}

function formatBrazilPhone(raw: string | null | undefined) {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  let normalized = digits
  if (normalized.startsWith('55') && normalized.length >= 12) {
    normalized = normalized.slice(2)
  }

  if (normalized.length === 11) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 7)}-${normalized.slice(7)}`
  }
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 6)}-${normalized.slice(6)}`
  }

  return raw
}

export function ProfileClient({ profile }: ProfileClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()

  const initialValues = useMemo(
    () => ({
      public_name: profile.public_name ?? '',
      creci: profile.creci ?? '',
      tagline: profile.tagline ?? '',
      bio: profile.bio ?? '',
      avatar_url: profile.avatar_url ?? '',
      phone: profile.phone ?? '',
      phone_e164: profile.phone_e164 ?? '',
      instagram_url: profile.instagram_url ?? '',
      facebook_url: profile.facebook_url ?? '',
      tiktok_url: profile.tiktok_url ?? '',
      youtube_url: profile.youtube_url ?? '',
      linkedin_url: profile.linkedin_url ?? '',
      website_url: profile.website_url ?? '',
      avatar_focus_x: profile.avatar_focus_x ?? 50,
      avatar_focus_y: profile.avatar_focus_y ?? 50,
      avatar_zoom: profile.avatar_zoom ?? 1,
    }),
    [profile]
  )

  const [form, setForm] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarUploadMessage, setAvatarUploadMessage] = useState<string | null>(null)
  const [isCopyingPublicLink, setIsCopyingPublicLink] = useState(false)

  const handleChange = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleReset = () => {
    setForm(initialValues)
    setError(null)
    setAvatarUploadMessage(null)
  }

  const handleAvatarUpload = async (file: File) => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      showError('Formato inválido. Use JPG, PNG ou WEBP.')
      return
    }

    if (file.size > MAX_AVATAR_BYTES) {
      showError('Arquivo muito grande. Limite de 5MB.')
      return
    }

    setIsUploadingAvatar(true)
    setAvatarUploadMessage(null)
    setError(null)

    const oldAvatarPath = extractCurrentAvatarPath(form.avatar_url, profile.id)
    const extension = getFileExtension(file)
    const newAvatarPath = `${profile.id}/avatar-${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(newAvatarPath, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type,
      })

    if (uploadError) {
      setIsUploadingAvatar(false)
      setError(uploadError.message)
      return
    }

    const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(newAvatarPath)
    const publicUrl = publicUrlData.publicUrl

    setForm((prev) => ({ ...prev, avatar_url: publicUrl }))
    setAvatarUploadMessage('Foto enviada. Clique em "Salvar alteracoes" para publicar.')
    success('Foto de perfil enviada.')

    if (oldAvatarPath && oldAvatarPath !== newAvatarPath) {
      void supabase.storage.from(AVATAR_BUCKET).remove([oldAvatarPath])
    }

    setIsUploadingAvatar(false)
  }

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    await handleAvatarUpload(file)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    const payload = {
      public_name: normalizeText(form.public_name),
      creci: normalizeText(form.creci),
      tagline: normalizeText(form.tagline),
      bio: normalizeText(form.bio),
      avatar_url: normalizeUrl(form.avatar_url),
      phone: normalizeText(form.phone),
      phone_e164: normalizeText(form.phone_e164),
      instagram_url: normalizeUrl(form.instagram_url),
      facebook_url: normalizeUrl(form.facebook_url),
      tiktok_url: normalizeUrl(form.tiktok_url),
      youtube_url: normalizeUrl(form.youtube_url),
      linkedin_url: normalizeUrl(form.linkedin_url),
      website_url: normalizeUrl(form.website_url),
      avatar_focus_x: Math.max(0, Math.min(100, Number(form.avatar_focus_x))),
      avatar_focus_y: Math.max(0, Math.min(100, Number(form.avatar_focus_y))),
      avatar_zoom: Math.max(1, Math.min(3, Number(form.avatar_zoom))),
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', profile.id)

    if (updateError) {
      setError(updateError.message)
      setIsSaving(false)
      return
    }

    setAvatarUploadMessage(null)
    success('Perfil público atualizado.')
    router.refresh()
    setIsSaving(false)
  }

  const publicProfilePath = `/corretores/${profile.id}`
  const avatarPreviewUrl = form.avatar_url.trim()
  const canSave = !isSaving && !isUploadingAvatar
  const avatarPosition = `${Number(form.avatar_focus_x)}% ${Number(form.avatar_focus_y)}%`
  const avatarZoom = Number(form.avatar_zoom)

  const previewName = form.public_name.trim() || profile.full_name || 'Corretor Vitrya'
  const previewInitials = getInitials(previewName)
  const previewTagline = form.tagline.trim()
  const previewBio = form.bio.trim()
  const previewCreci = form.creci.trim()
  const previewPhone = formatBrazilPhone(form.phone_e164 || form.phone)

  const previewSocials = [
    { key: 'instagram', label: 'Instagram', value: form.instagram_url.trim() },
    { key: 'facebook', label: 'Facebook', value: form.facebook_url.trim() },
    { key: 'tiktok', label: 'TikTok', value: form.tiktok_url.trim() },
    { key: 'youtube', label: 'YouTube', value: form.youtube_url.trim() },
    { key: 'linkedin', label: 'LinkedIn', value: form.linkedin_url.trim() },
    { key: 'website', label: 'Site', value: form.website_url.trim() },
  ].filter((item) => item.value.length > 0)

  const handleOpenPublicProfile = () => {
    window.open(publicProfilePath, '_blank', 'noopener,noreferrer')
  }

  const handleCopyPublicLink = async () => {
    if (typeof window === 'undefined') return
    setIsCopyingPublicLink(true)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicProfilePath}`)
      success('Link público copiado.')
    } catch {
      showError('Não foi possível copiar o link.')
    } finally {
      setIsCopyingPublicLink(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Perfil público do corretor</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Esses dados aparecem no card do corretor no imóvel e na pagina pública do corretor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleCopyPublicLink} disabled={isCopyingPublicLink}>
              {isCopyingPublicLink ? 'Copiando...' : 'Copiar link público'}
            </Button>
            <Button type="button" onClick={handleOpenPublicProfile}>
              Ver perfil público
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[var(--radius)] border border-[var(--destructive)]/50 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
          {error}
        </div>
      ) : null}

      {avatarUploadMessage ? (
        <div className="rounded-[var(--radius)] border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          {avatarUploadMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identidade pública</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="h-24 w-24 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--muted)] shrink-0">
                  {avatarPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarPreviewUrl}
                      alt="Avatar do corretor"
                      className="h-full w-full object-cover"
                      style={{
                        objectPosition: avatarPosition,
                        transform: `scale(${avatarZoom})`,
                        transformOrigin: 'center center',
                      }}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-lg font-semibold text-[var(--muted-foreground)]">
                      {getInitials(form.public_name || profile.full_name)}
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <Input
                    label="Avatar (URL)"
                    value={form.avatar_url}
                    onChange={(e) => handleChange('avatar_url', e.target.value)}
                    placeholder="https://"
                  />
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-[var(--foreground)]">Enviar foto de perfil</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarFileChange}
                      disabled={isUploadingAvatar || isSaving}
                      className="block w-full text-sm text-[var(--foreground)] file:mr-3 file:rounded-[var(--radius)] file:border file:border-[var(--border)] file:bg-[var(--card)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--foreground)] hover:file:bg-[var(--accent)]"
                    />
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Formatos: JPG, PNG, WEBP. Tamanho máximo: 5MB.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleChange('avatar_url', '')}
                      disabled={isUploadingAvatar || isSaving || !form.avatar_url}
                    >
                      Remover foto
                    </Button>
                    {isUploadingAvatar ? (
                      <span className="text-sm text-[var(--muted-foreground)]">Enviando foto...</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <Input
                label="Nome público"
                value={form.public_name}
                onChange={(e) => handleChange('public_name', e.target.value)}
                placeholder="Como deseja aparecer na vitrine"
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-medium text-[var(--foreground)]">
                  Enquadramento X ({Math.round(Number(form.avatar_focus_x))}%)
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Number(form.avatar_focus_x)}
                    onChange={(e) => handleChange('avatar_focus_x', Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
                <label className="block text-sm font-medium text-[var(--foreground)]">
                  Enquadramento Y ({Math.round(Number(form.avatar_focus_y))}%)
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Number(form.avatar_focus_y)}
                    onChange={(e) => handleChange('avatar_focus_y', Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
                <label className="block text-sm font-medium text-[var(--foreground)]">
                  Zoom ({Number(form.avatar_zoom).toFixed(2)}x)
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={Number(form.avatar_zoom)}
                    onChange={(e) => handleChange('avatar_zoom', Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
              </div>
              <Input
                label="CRECI"
                value={form.creci}
                onChange={(e) => handleChange('creci', e.target.value)}
                placeholder="Ex: 12345-F"
              />
              <Input
                label="Headline"
                value={form.tagline}
                onChange={(e) => handleChange('tagline', e.target.value)}
                placeholder="Ex: Especialista em imóveis de alto padrao"
              />
              <Textarea
                label="Bio"
                value={form.bio}
                onChange={(e) => handleChange('bio', e.target.value)}
                placeholder="Conte um pouco sobre sua atuacao"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contato público</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Telefone"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="(65) 99999-9999"
              />
              <Input
                label="Telefone (E.164)"
                value={form.phone_e164}
                onChange={(e) => handleChange('phone_e164', e.target.value)}
                placeholder="+5565999999999"
              />
              <div className="sm:col-span-2">
                <Input label="Email" value={profile.email ?? ''} readOnly disabled />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Redes sociais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Instagram"
                value={form.instagram_url}
                onChange={(e) => handleChange('instagram_url', e.target.value)}
                placeholder="instagram.com/seu-perfil"
              />
              <Input
                label="Facebook"
                value={form.facebook_url}
                onChange={(e) => handleChange('facebook_url', e.target.value)}
                placeholder="facebook.com/seu-perfil"
              />
              <Input
                label="TikTok"
                value={form.tiktok_url}
                onChange={(e) => handleChange('tiktok_url', e.target.value)}
                placeholder="tiktok.com/@seu-perfil"
              />
              <Input
                label="YouTube"
                value={form.youtube_url}
                onChange={(e) => handleChange('youtube_url', e.target.value)}
                placeholder="youtube.com/@seu-canal"
              />
              <Input
                label="LinkedIn"
                value={form.linkedin_url}
                onChange={(e) => handleChange('linkedin_url', e.target.value)}
                placeholder="linkedin.com/in/seu-perfil"
              />
              <Input
                label="Site"
                value={form.website_url}
                onChange={(e) => handleChange('website_url', e.target.value)}
                placeholder="seusite.com"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-20 self-start">
          <Card>
            <CardHeader>
              <CardTitle>Preview ao vivo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--accent)]/40 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--muted)] shrink-0">
                    {avatarPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarPreviewUrl}
                        alt={previewName}
                        className="h-full w-full object-cover"
                        style={{
                          objectPosition: avatarPosition,
                          transform: `scale(${avatarZoom})`,
                          transformOrigin: 'center center',
                        }}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-sm font-bold text-[var(--muted-foreground)]">
                        {previewInitials}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--foreground)] truncate">{previewName}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{previewCreci ? `CRECI ${previewCreci}` : 'CRECI não informado'}</p>
                  </div>
                </div>

                {previewTagline ? (
                  <p className="text-sm font-medium text-[var(--foreground)]">{previewTagline}</p>
                ) : null}

                {previewBio ? (
                  <p className="text-sm text-[var(--muted-foreground)]">{previewBio}</p>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">Adicione uma bio para aparecer no perfil público.</p>
                )}

                <div className="space-y-1 text-sm">
                  {previewPhone ? <p className="text-[var(--foreground)]">Telefone: {previewPhone}</p> : null}
                  {profile.email ? <p className="text-[var(--foreground)]">Email: {profile.email}</p> : null}
                </div>

                {previewSocials.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {previewSocials.map((item) => (
                      <span
                        key={item.key}
                        className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <Button type="button" className="w-full" onClick={handleOpenPublicProfile}>
                Ver perfil público
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campos públicos em uso</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-[var(--muted-foreground)] space-y-2">
              <p>Card do imóvel: nome público, avatar, CRECI, telefone/WhatsApp, bio e redes.</p>
              <p>Pagina do corretor: todos os campos acima + email público e imóveis ativos.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSave} loading={isSaving} disabled={!canSave}>
          Salvar alteracoes
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={isSaving || isUploadingAvatar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
