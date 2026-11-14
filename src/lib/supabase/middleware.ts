import { createServerClient } from "@supabase/ssr";
import {
  type NextRequest,
  NextResponse,
} from "next/server";
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
  const auth = authState ? ` auth=${authState}` : "";
  console.info(
    `[PERF] ${operation} path=${pathname} duration=${formatDuration(duration)}ms${auth}`,
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

export async function updateSession(request: NextRequest) {
  const middlewareStartedAt = performance.now();
  const pathname = request.nextUrl.pathname;
  let cookieReadDuration = 0;
  let cookieWriteDuration = 0;

  let response = NextResponse.next({
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
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
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
