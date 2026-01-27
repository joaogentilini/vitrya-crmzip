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
}

interface ProfileClientProps {
  profile: ProfileData
}

function normalizeText(value: string) {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export function ProfileClient({ profile }: ProfileClientProps) {
  const router = useRouter()
  const { success } = useToast()

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
    }),
    [profile]
  )

  const [form, setForm] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleReset = () => {
    setForm(initialValues)
    setError(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    const payload = {
      public_name: normalizeText(form.public_name),
      creci: normalizeText(form.creci),
      tagline: normalizeText(form.tagline),
      bio: normalizeText(form.bio),
      avatar_url: normalizeText(form.avatar_url),
      phone: normalizeText(form.phone),
      phone_e164: normalizeText(form.phone_e164),
      instagram_url: normalizeText(form.instagram_url),
      facebook_url: normalizeText(form.facebook_url),
      tiktok_url: normalizeText(form.tiktok_url),
      youtube_url: normalizeText(form.youtube_url),
      linkedin_url: normalizeText(form.linkedin_url),
      website_url: normalizeText(form.website_url),
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

    success('Perfil público atualizado!')
    router.refresh()
    setIsSaving(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Perfil público</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Essas informações aparecem na vitrine e no card do imóvel.
        </p>
      </div>

      {error ? (
        <div className="rounded-[var(--radius)] border border-[var(--destructive)]/50 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Identidade pública</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Nome público"
            value={form.public_name}
            onChange={(e) => handleChange('public_name', e.target.value)}
            placeholder="Como deseja aparecer na vitrine"
          />
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
            placeholder="Ex: Especialista em imóveis de alto padrão"
          />
          <Textarea
            label="Bio"
            value={form.bio}
            onChange={(e) => handleChange('bio', e.target.value)}
            placeholder="Conte um pouco sobre sua atuação"
          />
          <Input
            label="Avatar (URL)"
            value={form.avatar_url}
            onChange={(e) => handleChange('avatar_url', e.target.value)}
            placeholder="https://"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato público</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <Input
            label="Email"
            value={profile.email ?? ''}
            readOnly
            disabled
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redes sociais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Instagram"
            value={form.instagram_url}
            onChange={(e) => handleChange('instagram_url', e.target.value)}
            placeholder="https://instagram.com/seu-perfil"
          />
          <Input
            label="Facebook"
            value={form.facebook_url}
            onChange={(e) => handleChange('facebook_url', e.target.value)}
            placeholder="https://facebook.com/seu-perfil"
          />
          <Input
            label="TikTok"
            value={form.tiktok_url}
            onChange={(e) => handleChange('tiktok_url', e.target.value)}
            placeholder="https://tiktok.com/@seu-perfil"
          />
          <Input
            label="YouTube"
            value={form.youtube_url}
            onChange={(e) => handleChange('youtube_url', e.target.value)}
            placeholder="https://youtube.com/@seu-canal"
          />
          <Input
            label="LinkedIn"
            value={form.linkedin_url}
            onChange={(e) => handleChange('linkedin_url', e.target.value)}
            placeholder="https://linkedin.com/in/seu-perfil"
          />
          <Input
            label="Site"
            value={form.website_url}
            onChange={(e) => handleChange('website_url', e.target.value)}
            placeholder="https://seusite.com"
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSave} loading={isSaving}>
          Salvar alterações
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={isSaving}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
