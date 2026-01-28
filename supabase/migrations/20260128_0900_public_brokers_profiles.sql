-- Public broker profile fields + public view

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_name text,
  ADD COLUMN IF NOT EXISTS creci text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS website_url text;

CREATE OR REPLACE VIEW public.v_public_brokers AS
SELECT
  p.id,
  p.full_name,
  p.public_name,
  p.role,
  p.phone,
  p.phone_e164,
  p.email,
  p.is_active,
  p.creci,
  p.tagline,
  p.bio,
  p.avatar_url,
  p.instagram_url,
  p.facebook_url,
  p.tiktok_url,
  p.youtube_url,
  p.linkedin_url,
  p.website_url
FROM public.profiles p
WHERE p.is_active = true
  AND p.role IN ('corretor', 'gestor', 'admin');
