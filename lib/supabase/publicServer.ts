import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client "público" para VITRINE (Server Components):
 * - NÃO usa cookies
 * - NÃO persiste sessão
 * - NÃO faz auto refresh token
 * Resultado: elimina "refresh_token_already_used" na vitrine em produção.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          "X-Client-Info": "vitrya-public-web",
        },
      },
    }
  );
}
