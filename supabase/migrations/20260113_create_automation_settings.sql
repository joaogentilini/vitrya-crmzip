-- Create automation_settings table
CREATE TABLE IF NOT EXISTS public.automation_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text UNIQUE NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Insert default automation settings
INSERT INTO public.automation_settings (key, enabled) VALUES
  ('lead_created_whatsapp', true),
  ('no_action_24h', true),
  ('stale_3d', true),
  ('proposal_stage', true)
ON CONFLICT (key) DO NOTHING;

-- RLS policies (only admin can modify)
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read automation settings
CREATE POLICY "Anyone can view automation_settings"
  ON public.automation_settings FOR SELECT
  USING (true);

-- Only admins can update
CREATE POLICY "Only admins can update automation_settings"
  ON public.automation_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Only admins can insert
CREATE POLICY "Only admins can insert automation_settings"
  ON public.automation_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "Only admins can delete automation_settings"
  ON public.automation_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_automation_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_settings_updated_at();
