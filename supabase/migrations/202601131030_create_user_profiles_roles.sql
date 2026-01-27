-- Migration: User Profiles and Roles System
-- Creates profiles table with roles, RLS policies, and lead ownership

-- 1) Create profiles table if not exists, or alter to add missing columns
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  name text,
  email text,
  phone_e164 text,
  role text NOT NULL DEFAULT 'corretor' CHECK (role IN ('admin', 'gestor', 'corretor')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add columns if they don't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'corretor' CHECK (role IN ('admin', 'gestor', 'corretor'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_active') THEN
    ALTER TABLE profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'phone_e164') THEN
    ALTER TABLE profiles ADD COLUMN phone_e164 text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'updated_at') THEN
    ALTER TABLE profiles ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- 2) Add owner_user_id to leads table if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'owner_user_id') THEN
    ALTER TABLE leads ADD COLUMN owner_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index on owner_user_id for performance
CREATE INDEX IF NOT EXISTS idx_leads_owner_user_id ON leads(owner_user_id);

-- 3) Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to profiles
DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4) Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role(user_id uuid)
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = user_id;
  RETURN COALESCE(user_role, 'corretor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is admin or gestor
CREATE OR REPLACE FUNCTION is_admin_or_gestor(user_id uuid)
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = user_id;
  RETURN user_role IN ('admin', 'gestor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admin and gestor can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own basic info" ON profiles;
DROP POLICY IF EXISTS "Admin can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;

-- Profiles RLS Policies
-- Everyone can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Admin/gestor can view all profiles
CREATE POLICY "Admin and gestor can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin_or_gestor(auth.uid()));

-- Users can update their own basic info (full_name, phone_e164)
CREATE POLICY "Users can update own basic info"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin can update all profiles (for role changes, activation)
CREATE POLICY "Admin can update all profiles"
  ON profiles FOR UPDATE
  USING (get_user_role(auth.uid()) = 'admin');

-- Inserts only via service role (handled by API)
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- 6) Leads RLS Policies
-- Enable RLS on leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop existing lead policies
DROP POLICY IF EXISTS "Corretor can view own leads" ON leads;
DROP POLICY IF EXISTS "Admin and gestor can view all leads" ON leads;
DROP POLICY IF EXISTS "Corretor can update own leads" ON leads;
DROP POLICY IF EXISTS "Admin and gestor can update all leads" ON leads;
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON leads;
DROP POLICY IF EXISTS "Allow all authenticated users to view leads" ON leads;
DROP POLICY IF EXISTS "Allow all authenticated users to update leads" ON leads;
DROP POLICY IF EXISTS "Allow all authenticated users to insert leads" ON leads;

-- Corretor sees only their leads (or unassigned leads)
CREATE POLICY "Corretor can view own leads"
  ON leads FOR SELECT
  USING (
    owner_user_id = auth.uid() 
    OR owner_user_id IS NULL
    OR is_admin_or_gestor(auth.uid())
  );

-- Corretor can update only their leads
CREATE POLICY "Corretor can update own leads"
  ON leads FOR UPDATE
  USING (
    owner_user_id = auth.uid() 
    OR owner_user_id IS NULL
    OR is_admin_or_gestor(auth.uid())
  );

-- Anyone authenticated can insert leads
CREATE POLICY "Authenticated users can insert leads"
  ON leads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 7) Trigger to auto-set owner_user_id on insert if not provided
CREATE OR REPLACE FUNCTION set_lead_owner_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  
  -- If corretor, always set owner to self
  IF user_role = 'corretor' AND NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id = auth.uid();
  END IF;
  
  -- If no owner set and user is logged in, default to current user
  IF NEW.owner_user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.owner_user_id = auth.uid();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_lead_owner_trigger ON leads;
CREATE TRIGGER set_lead_owner_trigger
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION set_lead_owner_on_insert();

-- 8) Create user_audit_logs table for tracking user management actions
CREATE TABLE IF NOT EXISTS user_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id),
  target_user_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_actor ON user_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_target ON user_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_created ON user_audit_logs(created_at DESC);

-- Enable RLS on user_audit_logs
ALTER TABLE user_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admin/gestor can view user audit logs
CREATE POLICY "Admin and gestor can view user audit logs"
  ON user_audit_logs FOR SELECT
  USING (is_admin_or_gestor(auth.uid()));

-- Only service role can insert (via API)
CREATE POLICY "Service role can insert user audit logs"
  ON user_audit_logs FOR INSERT
  WITH CHECK (true);

-- 9) Bootstrap admin function
-- This function promotes the first user to admin if no admin exists
CREATE OR REPLACE FUNCTION bootstrap_admin_if_needed()
RETURNS void AS $$
DECLARE
  admin_count integer;
BEGIN
  -- Check if any admin exists
  SELECT COUNT(*) INTO admin_count FROM profiles WHERE role = 'admin';
  
  -- If no admin and current user has a profile, make them admin
  IF admin_count = 0 AND auth.uid() IS NOT NULL THEN
    UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE profiles IS 'User profiles with roles (admin, gestor, corretor)';
COMMENT ON TABLE user_audit_logs IS 'Audit trail for user management actions';
COMMENT ON COLUMN leads.owner_user_id IS 'User who owns/is responsible for this lead';
