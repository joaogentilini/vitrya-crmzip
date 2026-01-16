import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/leads", "/people", "/dashboard", "/agenda", "/settings", "/kanban"];
const isDev = process.env.NODE_ENV === "development";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!isProtected) return NextResponse.next();

  const allCookies = req.cookies.getAll();
  
  if (isDev) {
    const cookieNames = allCookies.map(c => c.name);
    console.log(`[middleware] pathname=${pathname}, cookies found:`, cookieNames);
  }

  const hasSession = allCookies.some((cookie) => {
    if (!cookie.name.startsWith("sb-")) return false;
    
    const lowerName = cookie.name.toLowerCase();
    
    if (
      lowerName.includes("auth-token") ||
      lowerName.includes("access-token") ||
      lowerName.includes("refresh-token") ||
      lowerName.includes("access_token") ||
      lowerName.includes("refresh_token")
    ) {
      return true;
    }
    
    if (/\.0$|\.1$|\.2$|\.3$|\.4$/.test(cookie.name)) {
      return true;
    }
    
    return false;
  });

  const hasAuthHeader = req.headers.get("authorization")?.startsWith("Bearer ");

  if (isDev) {
    console.log(`[middleware] hasSession=${hasSession}, hasAuthHeader=${hasAuthHeader}`);
  }

  if (hasSession || hasAuthHeader) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
