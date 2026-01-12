-- ETAPA 4: Tasks / Próxima Ação
-- Run this migration in Supabase SQL Editor

-- Create is_admin helper function if not exists
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('call','whatsapp','visit','proposal','email','other')),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','canceled')),
  notes text NULL,
  assigned_to uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS tasks_lead_id_idx ON public.tasks(lead_id);
CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON public.tasks(due_at);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- SELECT policy: user can see tasks they created, are assigned to, or have access to the lead
CREATE POLICY "tasks_select_policy" ON public.tasks
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.leads l 
    WHERE l.id = tasks.lead_id 
    AND (l.created_by = auth.uid() OR l.assigned_to = auth.uid())
  )
);

-- INSERT policy: user can create tasks for leads they have access to
-- Non-admins can only assign to themselves
CREATE POLICY "tasks_insert_policy" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (public.is_admin() OR assigned_to = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.leads l 
    WHERE l.id = lead_id 
    AND (l.created_by = auth.uid() OR l.assigned_to = auth.uid() OR public.is_admin())
  )
);

-- UPDATE policy: user can update tasks they created, are assigned to, or are admin
-- Prevent lead retargeting and unauthorized reassignment
-- Non-admins cannot change assigned_to (must remain auth.uid())
CREATE POLICY "tasks_update_policy" ON public.tasks
FOR UPDATE TO authenticated
USING (
  public.is_admin() 
  OR assigned_to = auth.uid() 
  OR created_by = auth.uid()
)
WITH CHECK (
  -- Admin can do anything
  public.is_admin()
  OR (
    -- Non-admin must keep assigned_to as their own UID (no reassignment)
    assigned_to = auth.uid()
    -- And must have access to the lead
    AND EXISTS (
      SELECT 1 FROM public.leads l 
      WHERE l.id = lead_id 
      AND (l.created_by = auth.uid() OR l.assigned_to = auth.uid())
    )
  )
);

-- DELETE policy: user can delete tasks they created, are assigned to, or are admin
CREATE POLICY "tasks_delete_policy" ON public.tasks
FOR DELETE TO authenticated
USING (
  public.is_admin() 
  OR assigned_to = auth.uid() 
  OR created_by = auth.uid()
);

-- Trigger for updating updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- View for lead next task (for indicators)
CREATE OR REPLACE VIEW public.lead_next_task AS
SELECT 
  l.id as lead_id,
  t.id as next_task_id,
  t.due_at as next_due_at,
  t.type as next_task_type,
  t.title as next_task_title,
  CASE WHEN t.due_at < now() THEN true ELSE false END as is_overdue,
  CASE WHEN t.id IS NOT NULL THEN true ELSE false END as has_open_task
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT id, due_at, type, title
  FROM public.tasks
  WHERE lead_id = l.id AND status = 'open'
  ORDER BY due_at ASC
  LIMIT 1
) t ON true;

-- Grant access to the view
GRANT SELECT ON public.lead_next_task TO authenticated;
