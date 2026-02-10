import { createBrowserClient } from "@supabase/ssr";

const isProduction =
  typeof window !== "undefined" && window.location.protocol === "https:";

/**
 * Se você usar este client em telas públicas (client components),
 * ele também fica SEM sessão/refresh.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: isProduction,
    },
  }
);
