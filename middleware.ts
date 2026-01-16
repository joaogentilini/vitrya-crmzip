import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/leads","/people","/dashboard", "/agenda", "/settings", "/kanban",];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Ignora rotas internas/arquivos estáticos
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  // Checa se a rota é protegida
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!isProtected) return NextResponse.next();

  // Verifica se tem sessão (qualquer cookie sb-* com auth/access/refresh token)
  const allCookies = req.cookies.getAll();
  const hasSession = allCookies.some((cookie) => {
    if (!cookie.name.startsWith("sb-")) return false;
    const lowerName = cookie.name.toLowerCase();
    return (
      lowerName.includes("auth-token") ||
      lowerName.includes("access-token") ||
      lowerName.includes("refresh-token") ||
      lowerName.includes("access_token") ||
      lowerName.includes("refresh_token")
    );
  });

  // Se tem sessão, segue normal
  if (hasSession) return NextResponse.next();

  // Se não tem sessão, redireciona para "/" (home/login) e guarda a rota desejada
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
