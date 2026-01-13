import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/leads", "/dashboard", "/agenda", "/settings", "/kanban"];

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

  // Verifica se tem sessão (cookie)
  const hasSession =
    req.cookies.get("sb-access-token") || req.cookies.get("sb-refresh-token");

  // Se tem sessão, segue normal
  if (hasSession) return NextResponse.next();

  // Se não tem sessão, redireciona para /auth e guarda a rota desejada
  const url = req.nextUrl.clone();
  url.pathname = "/auth";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
