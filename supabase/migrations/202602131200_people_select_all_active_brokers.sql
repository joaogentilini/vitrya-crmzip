-- ============================================================
-- MIGRATION: Expand people SELECT visibility for active brokers
-- Date: 2026-02-13
-- Purpose: Corretor must access all client records in people list/detail
-- ============================================================

-- Replace SELECT policy to allow any active CRM profile to read people.
DROP POLICY IF EXISTS "people_select" ON public.people;

CREATE POLICY "people_select" ON public.people
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role IN ('admin', 'gestor', 'corretor')
  )
);

