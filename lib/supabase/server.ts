import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function isRefreshTokenAlreadyUsed(err: unknown) {
  const anyErr = err as any;
  const code = String(anyErr?.code ?? "");
  const msg = String(anyErr?.message ?? "");
  return code === "refresh_token_already_used" || msg.includes("Already Used");
}

export async function createClient() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Next 15/16: cookieStore é ReadonlyRequestCookies
              // set pode falhar em Server Components (por isso o try/catch)
              (cookieStore as any).set(name, value, options);
            });
          } catch {
            // Server Component - ignore set cookie errors
          }
        },
      },
    }
  );

  /**
   * ✅ Blindagem contra "refresh_token_already_used"
   * Isso ocorre quando há concorrência e o refresh tenta rodar 2x.
   * Ao detectar, limpamos a sessão e seguimos.
   */
  async function safeGetSession() {
    try {
      return await supabase.auth.getSession();
    } catch (err) {
      if (isRefreshTokenAlreadyUsed(err)) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        return { data: { session: null }, error: null };
      }
      throw err;
    }
  }

  // Opcional: só chama no CRM/middleware. No público, evita refresh desnecessário.
  // Você pode comentar/descomentar conforme uso.
  // await safeGetSession();

  // expõe helper caso você queira usar explicitamente no CRM
  (supabase as any).safeGetSession = safeGetSession;

  return supabase;
}
