-- Add email column to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
