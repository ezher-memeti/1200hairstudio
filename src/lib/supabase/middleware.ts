import { createServerClient } from "@supabase/ssr";
import {
  type NextRequest,
  NextResponse,
} from "next/server";
import { isStaleRefreshTokenError } from "@/lib/supabase/auth-errors";

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
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    error,
  } = await supabase.auth.getUser();

  if (isStaleRefreshTokenError(error)) {
    clearSupabaseAuthCookies(request, response);
  }

  return response;
}
