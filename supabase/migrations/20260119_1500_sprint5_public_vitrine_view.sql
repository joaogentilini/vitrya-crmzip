-- Sprint 5 - Vitrine pública (Opção B Premium)
-- VIEW pública com imóveis ativos (aprovados) sem dados sensíveis do proprietário

create or replace view public.v_public_properties as
select
  p.id,
  p.title,
  p.description,
  p.status,

  -- negócio
  p.for_sale,
  p.for_rent,
  p.sale_price,
  p.rent_price,

  -- tipo / meta
  p.property_type,
  p.bedrooms,
  p.bathrooms,
  p.garage_spots,
  p.area_total,
  p.area_built,

  -- endereço (expor para vitrine)
  p.address_street,
  p.address_number,
  p.address_neighborhood,
  p.address_city,
  p.address_state,
  p.address_zip,

  -- geo (obrigatório na vitrine)
  p.latitude,
  p.longitude,

  -- mídia (capa)
  (
    select pm.url
    from public.property_media pm
    where pm.property_id = p.id
    order by pm.position asc, pm.created_at asc
    limit 1
  ) as cover_media_url,

  p.created_at,
  p.updated_at
from public.properties p
where p.status = 'active';
