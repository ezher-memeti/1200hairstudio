import { createServerClient } from "@supabase/ssr";
import {
  type NextRequest,
  NextResponse,
} from "next/server";
import { isLocale, localeCookie } from "@/i18n/config";
import { isStaleRefreshTokenError } from "@/lib/supabase/auth-errors";

function elapsedMilliseconds(startedAt: number) {
  return performance.now() - startedAt;
}

function formatDuration(duration: number) {
  return duration.toFixed(2);
}

function logTiming(
  operation: string,
  pathname: string,
  duration: number,
  authState?: "anonymous" | "authenticated" | "unknown",
) {
  const safePathname = pathname.replace(/^(\/(?:(?:de|en)\/)?(?:booking\/manage|unsubscribe))\/[^/]+/, "$1/[token]");
  const auth = authState ? ` auth=${authState}` : "";
  console.info(
    `[PERF] ${operation} path=${safePathname} duration=${formatDuration(duration)}ms${auth}`,
  );
}

function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
) {
  const cookieNames = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter(
      (name) =>
        name.startsWith("sb-") ||
        name.includes("supabase-auth-token"),
    );

  cookieNames.forEach((name) => {
    request.cookies.delete(name);
    response.cookies.set(name, "", {
      maxAge: 0,
      expires: new Date(0),
      path: "/",
    });
  });
}

export async function updateSession(request: NextRequest, initialResponse?: NextResponse) {
  const middlewareStartedAt = performance.now();
  const pathname = request.nextUrl.pathname;
  let cookieReadDuration = 0;
  let cookieWriteDuration = 0;

  let response = initialResponse ?? NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const clientCreationStartedAt = performance.now();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          const startedAt = performance.now();
          const cookies = request.cookies.getAll();
          const duration = elapsedMilliseconds(startedAt);
          cookieReadDuration += duration;
          logTiming("SUPABASE_COOKIE_READ", pathname, duration);
          return cookies;
        },
        setAll(cookiesToSet) {
          const startedAt = performance.now();
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Forward refreshed cookies into the rewritten server render as well as
          // the browser response. Preserve locale headers and accumulated cookies.
          const previous = response;
          const rewrite = previous.headers.get("x-middleware-rewrite");
          response = rewrite
            ? NextResponse.rewrite(rewrite, { request: { headers: request.headers } })
            : NextResponse.next({ request: { headers: request.headers } });
          previous.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          const duration = elapsedMilliseconds(startedAt);
          cookieWriteDuration += duration;
          logTiming("SUPABASE_COOKIE_WRITE", pathname, duration);
        },
      },
    },
  );
  const clientCreationDuration = elapsedMilliseconds(clientCreationStartedAt);
  logTiming("SUPABASE_CLIENT_CREATION", pathname, clientCreationDuration);

  const authStartedAt = performance.now();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const authDuration = elapsedMilliseconds(authStartedAt);
  const authState = error
    ? "unknown"
    : user
      ? "authenticated"
      : "anonymous";
  logTiming("SUPABASE_AUTH_GET_USER", pathname, authDuration, authState);

  // Only legacy, unprefixed UI requests need account-locale negotiation.
  if (user && !error && !request.cookies.get(localeCookie) && !/^\/(?:de|en|api|auth|_next)(?:\/|$)/.test(pathname) && !/\.[^/]+$/.test(pathname)) {
    const [{ data: customer }, { data: profile }] = await Promise.all([
      supabase.from("customers").select("preferred_locale").eq("profile_id", user.id).maybeSingle(),
      supabase.from("profiles").select("preferred_locale").eq("id", user.id).maybeSingle(),
    ]);
    const preferred = isLocale(customer?.preferred_locale) ? customer.preferred_locale : profile?.preferred_locale;
    if (isLocale(preferred)) response.headers.set("x-app-preferred-locale", preferred);
  }

  let staleCookieClearDuration = 0;
  if (isStaleRefreshTokenError(error)) {
    const staleCookieClearStartedAt = performance.now();
    clearSupabaseAuthCookies(request, response);
    staleCookieClearDuration = elapsedMilliseconds(staleCookieClearStartedAt);
    logTiming(
      "SUPABASE_STALE_COOKIE_CLEAR",
      pathname,
      staleCookieClearDuration,
      authState,
    );
  }

  const middlewareDuration = elapsedMilliseconds(middlewareStartedAt);
  logTiming("MIDDLEWARE_TOTAL", pathname, middlewareDuration, authState);

  response.headers.append(
    "Server-Timing",
    [
      `middleware;dur=${formatDuration(middlewareDuration)}`,
      `supabase-client;dur=${formatDuration(clientCreationDuration)}`,
      `supabase-auth;dur=${formatDuration(authDuration)}`,
      `cookie-read;dur=${formatDuration(cookieReadDuration)}`,
      `cookie-write;dur=${formatDuration(cookieWriteDuration)}`,
      `stale-cookie-clear;dur=${formatDuration(staleCookieClearDuration)}`,
    ].join(", "),
  );

  return response;
}
