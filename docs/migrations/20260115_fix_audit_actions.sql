-- ============================================================
-- FIX: Audit logging actions to match CHECK constraint
-- Constraint allows: ['create','update','delete','move_stage']
-- TG_OP returns: 'INSERT','UPDATE','DELETE'
-- ============================================================

-- 1) Fix the audit_lead_changes function to use correct action values
CREATE OR REPLACE FUNCTION public.audit_lead_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_actor uuid;
    v_action text;
BEGIN
    -- Get actor ID with fallback
    v_actor := auth.uid();
    
    -- Fallback if auth.uid() is null (e.g., service role or trigger context)
    IF v_actor IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            v_actor := COALESCE(OLD.owner_user_id, OLD.user_id, OLD.created_by, OLD.assigned_to);
        ELSE
            v_actor := COALESCE(NEW.owner_user_id, NEW.user_id, NEW.created_by, NEW.assigned_to);
        END IF;
    END IF;
    
    -- If still null, use a system UUID
    IF v_actor IS NULL THEN
        v_actor := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
    
    -- MAP TG_OP to allowed actions: 'create','update','delete','move_stage'
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        INSERT INTO public.lead_audit_logs (lead_id, actor_id, action, before, after)
        VALUES (NEW.id, v_actor, v_action, NULL, to_jsonb(NEW));
        RETURN NEW;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Use 'move_stage' if stage_id changed, else 'update'
        IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
            v_action := 'move_stage';
        ELSE
            v_action := 'update';
        END IF;
        INSERT INTO public.lead_audit_logs (lead_id, actor_id, action, before, after)
        VALUES (NEW.id, v_actor, v_action, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        INSERT INTO public.lead_audit_logs (lead_id, actor_id, action, before, after)
        VALUES (OLD.id, v_actor, v_action, to_jsonb(OLD), NULL);
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trigger_audit_lead_changes ON public.leads;
CREATE TRIGGER trigger_audit_lead_changes
AFTER INSERT OR UPDATE OR DELETE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.audit_lead_changes();

-- 3) Drop duplicate/conflicting triggers that may write invalid actions
DROP TRIGGER IF EXISTS lead_audit_trg ON public.leads;
DROP TRIGGER IF EXISTS trg_audit_leads_write ON public.leads;
-- Keep trg_log_lead_stage_change if it only writes to lead_stage_changes table

-- 4) Clean up any invalid audit log entries (optional, run manually)
-- DELETE FROM public.lead_audit_logs WHERE action NOT IN ('create','update','delete','move_stage');

-- ============================================================
-- VERIFICATION QUERIES (run after applying fix)
-- ============================================================

-- A) Check triggers on leads table
-- SELECT tgname, proname, tgenabled
-- FROM pg_trigger t
-- JOIN pg_proc p ON t.tgfoid = p.oid
-- WHERE t.tgrelid = 'public.leads'::regclass
-- AND NOT t.tgisinternal;

-- B) Verify no invalid actions exist
-- SELECT action, COUNT(*) FROM public.lead_audit_logs
-- GROUP BY action ORDER BY action;

-- C) Check the CHECK constraint
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'public.lead_audit_logs'::regclass AND contype = 'c';
