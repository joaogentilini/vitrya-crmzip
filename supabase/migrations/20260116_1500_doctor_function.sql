-- ============================================================
-- VITRYA DOCTOR FUNCTION
-- Verifica integridade do schema e retorna diagnóstico
-- (corrigido: concatenação segura de arrays jsonb + tipagem)
-- ============================================================

CREATE OR REPLACE FUNCTION public.vitrya_doctor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  missing_tables   jsonb := '[]'::jsonb;
  missing_columns  jsonb := '[]'::jsonb;
  missing_triggers jsonb := '[]'::jsonb;
  rls_disabled     jsonb := '[]'::jsonb;
  notes            jsonb := '[]'::jsonb;

  tbl text;
  col text;
BEGIN
  -- Expected tables
  FOR tbl IN
    SELECT unnest(ARRAY[
      'leads', 'pipelines', 'pipeline_stages',
      'lead_types', 'lead_interests', 'lead_sources',
      'profiles', 'tasks', 'lead_notes', 'lead_audit_logs',
      'people', 'clients', 'automation_settings'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- append as JSON array element
      missing_tables := missing_tables || jsonb_build_array(tbl::text);
    END IF;
  END LOOP;

  -- Check critical columns per table
  -- leads
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) THEN
    FOR col IN
      SELECT unnest(ARRAY['id', 'title', 'pipeline_id', 'stage_id', 'status', 'owner_user_id', 'is_converted'])
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = col
      ) THEN
        missing_columns := missing_columns || jsonb_build_array(
          jsonb_build_object('table', 'leads', 'column', col)
        );
      END IF;
    END LOOP;
  END IF;

  -- profiles
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    FOR col IN
      SELECT unnest(ARRAY['id', 'role', 'is_active', 'full_name', 'email'])
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = col
      ) THEN
        missing_columns := missing_columns || jsonb_build_array(
          jsonb_build_object('table', 'profiles', 'column', col)
        );
      END IF;
    END LOOP;
  END IF;

  -- pipelines
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pipelines'
  ) THEN
    FOR col IN
      SELECT unnest(ARRAY['id', 'name', 'slug'])
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipelines' AND column_name = col
      ) THEN
        missing_columns := missing_columns || jsonb_build_array(
          jsonb_build_object('table', 'pipelines', 'column', col)
        );
      END IF;
    END LOOP;
  END IF;

  -- pipeline_stages
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pipeline_stages'
  ) THEN
    FOR col IN
      SELECT unnest(ARRAY['id', 'pipeline_id', 'name', 'position'])
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_stages' AND column_name = col
      ) THEN
        missing_columns := missing_columns || jsonb_build_array(
          jsonb_build_object('table', 'pipeline_stages', 'column', col)
        );
      END IF;
    END LOOP;
  END IF;

  -- tasks
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) THEN
    FOR col IN
      SELECT unnest(ARRAY['id', 'lead_id', 'type', 'status', 'due_date'])
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = col
      ) THEN
        missing_columns := missing_columns || jsonb_build_array(
          jsonb_build_object('table', 'tasks', 'column', col)
        );
      END IF;
    END LOOP;
  END IF;

  -- clients
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  ) THEN
    FOR col IN
      SELECT unnest(ARRAY['id', 'name', 'person_id', 'owner_user_id', 'status'])
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = col
      ) THEN
        missing_columns := missing_columns || jsonb_build_array(
          jsonb_build_object('table', 'clients', 'column', col)
        );
      END IF;
    END LOOP;
  END IF;

  -- Check expected triggers
  -- leads.set_updated_at_leads
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND event_object_table = 'leads'
        AND trigger_name = 'set_updated_at_leads'
    ) THEN
      missing_triggers := missing_triggers || jsonb_build_array('leads.set_updated_at_leads'::text);
    END IF;
  END IF;

  -- profiles.set_updated_at_profiles
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND event_object_table = 'profiles'
        AND trigger_name = 'set_updated_at_profiles'
    ) THEN
      missing_triggers := missing_triggers || jsonb_build_array('profiles.set_updated_at_profiles'::text);
    END IF;
  END IF;

  -- pipelines.set_updated_at_pipelines
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pipelines'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND event_object_table = 'pipelines'
        AND trigger_name = 'set_updated_at_pipelines'
    ) THEN
      missing_triggers := missing_triggers || jsonb_build_array('pipelines.set_updated_at_pipelines'::text);
    END IF;
  END IF;

  -- pipeline_stages.set_updated_at_pipeline_stages
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pipeline_stages'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND event_object_table = 'pipeline_stages'
        AND trigger_name = 'set_updated_at_pipeline_stages'
    ) THEN
      missing_triggers := missing_triggers || jsonb_build_array('pipeline_stages.set_updated_at_pipeline_stages'::text);
    END IF;
  END IF;

  -- Check RLS on sensitive tables
  FOR tbl IN
    SELECT unnest(ARRAY['leads', 'profiles', 'tasks', 'lead_notes', 'clients', 'people'])
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename = tbl AND rowsecurity = true
      ) THEN
        rls_disabled := rls_disabled || jsonb_build_array(tbl::text);
      END IF;
    END IF;
  END LOOP;

  -- Add notes based on findings
  IF jsonb_array_length(missing_tables) > 0 THEN
    notes := notes || jsonb_build_array('Aplique a migration 20260116_fix_schema_stabilization.sql'::text);
  END IF;

  IF jsonb_array_length(rls_disabled) > 0 THEN
    notes := notes || jsonb_build_array('RLS desabilitado em tabelas sensíveis - verifique policies'::text);
  END IF;

  IF jsonb_array_length(missing_triggers) > 0 THEN
    notes := notes || jsonb_build_array('Triggers de updated_at faltando - aplique fix_schema_stabilization.sql'::text);
  END IF;

  -- Build final result
  result := jsonb_build_object(
    'ok', (
      jsonb_array_length(missing_tables) = 0 AND
      jsonb_array_length(missing_columns) = 0 AND
      jsonb_array_length(missing_triggers) = 0 AND
      jsonb_array_length(rls_disabled) = 0
    ),
    'checked_at', now(),
    'missing_tables', missing_tables,
    'missing_columns', missing_columns,
    'missing_triggers', missing_triggers,
    'rls_disabled', rls_disabled,
    'notes', notes
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.vitrya_doctor() IS 'Verifica integridade do schema do Vitrya CRM e retorna diagnóstico';

-- Grant execute to authenticated users (API will check role)
GRANT EXECUTE ON FUNCTION public.vitrya_doctor() TO authenticated;
