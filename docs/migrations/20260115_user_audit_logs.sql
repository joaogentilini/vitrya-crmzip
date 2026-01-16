-- Migration: Create user_audit_logs table and ensure profiles.email column exists
-- Run this in Supabase SQL Editor

-- 1. Add email column to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- 2. Create user_audit_logs table
CREATE TABLE IF NOT EXISTS public.user_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_actor ON public.user_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_target ON public.user_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_created ON public.user_audit_logs(created_at DESC);

-- 4. Enable RLS
ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS policy: only admins can view user audit logs
DROP POLICY IF EXISTS "Admins can view user audit logs" ON public.user_audit_logs;
CREATE POLICY "Admins can view user audit logs" ON public.user_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.is_active = true
    )
  );

-- 6. Service role bypass for inserts
DROP POLICY IF EXISTS "Service role can insert user audit logs" ON public.user_audit_logs;
CREATE POLICY "Service role can insert user audit logs" ON public.user_audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.user_audit_logs TO authenticated;
GRANT INSERT ON public.user_audit_logs TO service_role;
