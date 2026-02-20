// lib/supabase/admin.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

let adminClient: ReturnType<typeof createClient> | null = null;

export function createAdminClient() {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  adminClient = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
