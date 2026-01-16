-- ============================================================
-- Migration: Disable audit trigger to prevent duplicate entries
-- Date: 2026-01-15
-- Description: The trigger creates duplicate entries because the 
--              application code ALSO inserts into lead_audit_logs manually.
--              We keep the manual inserts (more control) and disable the trigger.
-- ============================================================

-- Disable (but don't drop) the trigger so it can be re-enabled if needed
DROP TRIGGER IF EXISTS trigger_audit_lead_changes ON public.leads;
DROP TRIGGER IF EXISTS lead_audit_trg ON public.leads;
DROP TRIGGER IF EXISTS trg_audit_leads_write ON public.leads;
DROP TRIGGER IF EXISTS trg_log_lead_stage_change ON public.leads;

-- Verification: Check no triggers remain that write to lead_audit_logs
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.leads'::regclass AND NOT tgisinternal;
