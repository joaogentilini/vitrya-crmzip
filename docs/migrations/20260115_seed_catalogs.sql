-- ============================================================
-- SEED DEFAULT CATALOG DATA (Idempotent - safe to run multiple times)
-- ============================================================

-- Lead Types (Tipo de Lead)
INSERT INTO public.lead_types (name, position, is_active)
SELECT name, position, true
FROM (VALUES 
  ('Compra', 1),
  ('Locação', 2),
  ('Permuta', 3)
) AS v(name, position)
WHERE NOT EXISTS (SELECT 1 FROM public.lead_types WHERE lead_types.name = v.name);

-- Lead Interests (Interesse)
INSERT INTO public.lead_interests (name, position, is_active)
SELECT name, position, true
FROM (VALUES 
  ('MCMV', 1),
  ('Na Planta', 2),
  ('Terreno', 3),
  ('Casa Padrão', 4),
  ('Alto Padrão', 5),
  ('Comercial', 6),
  ('Industrial', 7)
) AS v(name, position)
WHERE NOT EXISTS (SELECT 1 FROM public.lead_interests WHERE lead_interests.name = v.name);

-- Lead Sources (Origem)
INSERT INTO public.lead_sources (name, position, is_active)
SELECT name, position, true
FROM (VALUES 
  ('Instagram', 1),
  ('Indicação', 2),
  ('Site', 3),
  ('Tráfego Pago', 4),
  ('WhatsApp', 5)
) AS v(name, position)
WHERE NOT EXISTS (SELECT 1 FROM public.lead_sources WHERE lead_sources.name = v.name);

-- Verification query
-- SELECT 'lead_types' as table_name, COUNT(*) as count FROM lead_types
-- UNION ALL
-- SELECT 'lead_interests', COUNT(*) FROM lead_interests
-- UNION ALL
-- SELECT 'lead_sources', COUNT(*) FROM lead_sources;
