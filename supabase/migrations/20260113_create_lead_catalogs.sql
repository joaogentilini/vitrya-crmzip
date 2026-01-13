-- Create lead catalog tables: Types, Interests, Sources

-- Lead Types (Compra, Venda, Locação, Investimento)
CREATE TABLE IF NOT EXISTS public.lead_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Lead Interests (Casa, Apartamento, Terreno, etc)
CREATE TABLE IF NOT EXISTS public.lead_interests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Lead Sources (Instagram, Tráfego Pago, Indicação, etc)
CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Seed Lead Types
INSERT INTO public.lead_types (name, position) VALUES
  ('Compra', 1),
  ('Venda', 2),
  ('Locação', 3),
  ('Investimento', 4)
ON CONFLICT (name) DO NOTHING;

-- Seed Lead Interests
INSERT INTO public.lead_interests (name, position) VALUES
  ('Casa', 1),
  ('Apartamento', 2),
  ('Terreno', 3),
  ('Comercial', 4),
  ('Industrial', 5),
  ('MCMV (Minha Casa Minha Vida)', 6),
  ('Na Planta', 7)
ON CONFLICT (name) DO NOTHING;

-- Seed Lead Sources
INSERT INTO public.lead_sources (name, position) VALUES
  ('Instagram', 1),
  ('Tráfego Pago', 2),
  ('Indicação', 3),
  ('OLX', 4),
  ('Portal', 5),
  ('WhatsApp', 6),
  ('Outros', 7)
ON CONFLICT (name) DO NOTHING;

-- RLS Policies for catalogs (everyone can read, only admins can modify)
ALTER TABLE public.lead_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

-- Read policies (everyone)
CREATE POLICY "Anyone can view lead_types" ON public.lead_types FOR SELECT USING (true);
CREATE POLICY "Anyone can view lead_interests" ON public.lead_interests FOR SELECT USING (true);
CREATE POLICY "Anyone can view lead_sources" ON public.lead_sources FOR SELECT USING (true);

-- Admin write policies
CREATE POLICY "Admins can manage lead_types" ON public.lead_types 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can manage lead_interests" ON public.lead_interests 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can manage lead_sources" ON public.lead_sources 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
