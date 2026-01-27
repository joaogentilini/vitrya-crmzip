-- Sprint 5 - Vitrine pública (Opção B Premium)
-- VIEW pública com imóveis ativos sem dados sensíveis do proprietário
-- Alinhada ao schema real de public.properties

create or replace view public.v_public_properties as
select
  p.id,
  p.title,
  p.description,
  p.status,
  p.purpose,
  p.price,
  p.rent_price,
  p.city,
  p.neighborhood,
  p.property_category_id,
  p.cover_media_url,
  p.created_at
from public.properties p
where p.status = 'active';
