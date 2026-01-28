-- Extend public properties view with broker fields (append-only)
CREATE OR REPLACE VIEW public.v_public_properties_ext AS
SELECT
  vp.id,
  vp.title,
  vp.description,
  vp.status,
  vp.purpose,
  vp.price,
  vp.rent_price,
  vp.city,
  vp.neighborhood,
  vp.property_category_id,
  vp.cover_media_url,
  vp.created_at,
  pc.name AS property_category_name,

  -- broker fields (APPENDED at the end to avoid column reorder issues)
  p.owner_user_id AS broker_id,
  pr.full_name AS broker_full_name,
  pr.public_name AS broker_public_name,
  pr.creci AS broker_creci,
  pr.phone AS broker_phone,
  pr.phone_e164 AS broker_phone_e164,
  pr.email AS broker_email,
  pr.avatar_url AS broker_avatar_url,
  pr.tagline AS broker_tagline,
  pr.bio AS broker_bio,
  pr.instagram_url AS broker_instagram_url,
  pr.facebook_url AS broker_facebook_url,
  pr.tiktok_url AS broker_tiktok_url,
  pr.youtube_url AS broker_youtube_url,
  pr.linkedin_url AS broker_linkedin_url,
  pr.website_url AS broker_website_url
FROM public.v_public_properties vp
LEFT JOIN public.property_categories pc ON pc.id = vp.property_category_id
LEFT JOIN public.properties p ON p.id = vp.id
LEFT JOIN public.profiles pr ON pr.id = p.owner_user_id;
