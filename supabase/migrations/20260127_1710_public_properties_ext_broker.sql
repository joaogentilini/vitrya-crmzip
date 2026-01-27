-- Extend public properties view with broker fields

CREATE OR REPLACE VIEW public.v_public_properties_ext AS
SELECT
  p.id,
  p.status,
  p.purpose,
  p.title,
  p.description,
  p.city,
  p.neighborhood,
  p.address,
  p.price,
  p.rent_price,
  p.area_m2,
  p.bedrooms,
  p.bathrooms,
  p.parking,
  p.cover_media_url,
  p.created_at,
  p.property_category_id,
  pc.name AS property_category_name,
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
FROM public.properties p
LEFT JOIN public.property_categories pc ON pc.id = p.property_category_id
LEFT JOIN public.profiles pr ON pr.id = p.owner_user_id
WHERE p.status = 'active';
