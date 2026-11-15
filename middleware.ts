import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Meta authenticates this exact callback with the verification token/HMAC,
  // never a browser session. Keep all other paths on the existing auth flow.
  if (request.nextUrl.pathname === "/api/webhooks/whatsapp") {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
