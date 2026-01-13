-- Alter leads table for complete lead data

-- Add new columns to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_raw text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_type_id uuid REFERENCES public.lead_types(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_interest_id uuid REFERENCES public.lead_interests(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_source_id uuid REFERENCES public.lead_sources(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS budget_range text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill client_name from title for existing leads
UPDATE public.leads 
SET client_name = COALESCE(client_name, title, 'Lead antigo')
WHERE client_name IS NULL;

-- Create unique index on phone_e164 for deduplication (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_e164_unique 
ON public.leads (phone_e164) 
WHERE phone_e164 IS NOT NULL;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_updated_at();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS leads_lead_type_id_idx ON public.leads(lead_type_id);
CREATE INDEX IF NOT EXISTS leads_lead_interest_id_idx ON public.leads(lead_interest_id);
CREATE INDEX IF NOT EXISTS leads_lead_source_id_idx ON public.leads(lead_source_id);
CREATE INDEX IF NOT EXISTS leads_owner_user_id_idx ON public.leads(owner_user_id);
