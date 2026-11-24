import { getSiteMode, siteModeDestination } from "@/lib/site-mode";
import { type NextRequest, NextResponse } from "next/server";
import { isNonLocalizedPath, isLocale, localizedPath, localeCookie, resolveLocale } from "@/i18n/config";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Meta authenticates this exact callback with the verification token/HMAC,
  // never a browser session. Keep all other paths on the existing auth flow.
  if (request.nextUrl.pathname === "/api/webhooks/whatsapp") {
    return NextResponse.next();
  }
  const path = request.nextUrl.pathname;
  // Machine endpoints keep their exact URLs and existing session/security behavior.
  if (isNonLocalizedPath(path)) return updateSession(request);
  const prefix = path.split("/")[1];
  if (/^[a-z]{2}$/.test(prefix) && !isLocale(prefix)) return new NextResponse(null, { status: 404 });
  const locale = isLocale(prefix) ? prefix : resolveLocale(request.cookies.get(localeCookie)?.value);
  if (!isLocale(prefix)) {
    const target = new URL(request.url);
    target.host = request.headers.get("host") ?? target.host;
    target.pathname = localizedPath(path, locale);
    const session = await updateSession(request);
    if (session.status !== 200) return session;
    const preferred = session.headers.get("x-app-preferred-locale");
    if (isLocale(preferred)) target.pathname = localizedPath(path, preferred);
    const response = NextResponse.redirect(target);
    session.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
    return response;
  }
  // Keep the internal request origin for rewrites; a public Host can trigger
  // an external proxy hop and re-enter middleware on a bound dev server.
  const target = new URL(request.url);
  target.pathname = path.replace(/^\/(de|en)(?=\/|$)/, "") || "/";
  if (isNonLocalizedPath(target.pathname)) return new NextResponse(null, { status: 404 });
  const mode = getSiteMode();
  const destination = siteModeDestination(mode, target.pathname);
  if (destination) target.pathname = destination;
  // Named aliases use existing pages without duplicating booking or auth logic.
  if (target.pathname === "/dashboard") target.pathname = "/account";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-next-intl-locale", locale);
  requestHeaders.set("x-app-pathname", path);
  request.headers.set("x-next-intl-locale", locale);
  request.headers.set("x-app-pathname", path);
  const response = await updateSession(request, NextResponse.rewrite(target, { request: { headers: requestHeaders } }));
  if (!destination || response.status !== 200) return response;
  // Only document requests use 503. Server Actions retain their response protocol
  // (including the locale switch); public creation is independently gated below middleware.
  const maintenance = mode === "under_construction" && (request.method === "GET" || request.method === "HEAD");
  const result = new NextResponse(response.body, { status: maintenance ? 503 : response.status, headers: response.headers });
  result.headers.set("Cache-Control", "private, no-store, max-age=0");
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (maintenance) result.headers.set("Retry-After", "300");
  return result;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
