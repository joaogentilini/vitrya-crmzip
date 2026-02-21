import { NextRequest, NextResponse } from "next/server";

const PROTECTED = [
  "/settings",
  "/admin",
  "/dashboard",
  "/leads",
  "/agenda",
  "/properties",
  "/people",
  "/perfil",
  "/blocked",
  "/erp",
];

const isDev = process.env.NODE_ENV === "development";
const ACCENTED_IMOVEIS = "/im\u00F3veis";
const ENCODED_ACCENTED_IMOVEIS = "/im%C3%B3veis";
const LATIN1_ENCODED_ACCENTED_IMOVEIS = "/im%F3veis";
const LATIN1_ENCODED_ACCENTED_IMOVEIS_LOWER = "/im%f3veis";

function isSupabaseAuthCookie(cookieName: string): boolean {
  if (!cookieName.startsWith("sb-")) return false;

  const lowerName = cookieName.toLowerCase();

  if (
    lowerName.includes("auth-token") ||
    lowerName.includes("access-token") ||
    lowerName.includes("refresh-token") ||
    lowerName.includes("access_token") ||
    lowerName.includes("refresh_token")
  ) {
    return true;
  }

  const authTokenChunkPattern = /^sb-[a-z0-9]+-auth-token\.\d+$/i;
  return authTokenChunkPattern.test(cookieName);
}

function normalizeLegacyPath(pathname: string): string | null {
  const encodedLegacyBases = [
    ENCODED_ACCENTED_IMOVEIS,
    LATIN1_ENCODED_ACCENTED_IMOVEIS,
    LATIN1_ENCODED_ACCENTED_IMOVEIS_LOWER,
  ];

  for (const base of encodedLegacyBases) {
    if (pathname === base) return "/imoveis";

    const encodedLegacyPrefix = `${base}/`;
    if (pathname.startsWith(encodedLegacyPrefix)) {
      return `/imoveis/${pathname.slice(encodedLegacyPrefix.length)}`;
    }
  }

  if (pathname === ACCENTED_IMOVEIS) return "/imoveis";

  const legacyPrefix = `${ACCENTED_IMOVEIS}/`;
  if (pathname.startsWith(legacyPrefix)) {
    return `/imoveis/${pathname.slice(legacyPrefix.length)}`;
  }

  return null;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const normalizedPath = normalizeLegacyPath(pathname);
  if (normalizedPath) {
    const url = req.nextUrl.clone();
    url.pathname = normalizedPath;
    return NextResponse.redirect(url, 308);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const allCookies = req.cookies.getAll();

  if (isDev) {
    const cookieNames = allCookies.map((c) => c.name);
    console.log(`[proxy] pathname=${pathname}, cookies found:`, cookieNames);
  }

  const hasSession = allCookies.some((cookie) => isSupabaseAuthCookie(cookie.name));

  const authHeader = req.headers.get("authorization");
  const hasAuthHeader = authHeader?.startsWith("Bearer ") && authHeader.length > 7;

  if (isDev) {
    console.log(`[proxy] hasSession=${hasSession}, hasAuthHeader=${hasAuthHeader}`);
  }

  if (hasSession || hasAuthHeader) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/crm/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
