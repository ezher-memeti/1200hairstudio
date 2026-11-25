import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeLogDetails } from "@/lib/logging";
import { isLocale, localizedPath, type Locale } from "@/i18n/config";
import { getLocalizedSiteUrl, getResetPasswordRedirectUrl } from "./url";
import { isRateLimitError, isValidEmail, normalizeAuthEmail, validatePassword } from "./shared";

type Operation = "register" | "forgot-password";
function reply(body: object, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", ...extra } });
}
function requestOrigin(request: Request) {
  const incoming = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return incoming.origin;
  // Host is supplied by the browser/edge; do not trust arbitrary forwarded-host headers.
  const origin = new URL(`${incoming.protocol}//${host}`);
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || origin.host !== host.toLowerCase()) throw new Error("forbidden");
  return origin.origin;
}
async function parse(request: Request) {
  if (request.headers.get("x-auth-form") !== "1" || request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.get("origin") && request.headers.get("origin") !== requestOrigin(request))) throw new Error("forbidden");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("invalid_request");
  const reader = request.body?.getReader();if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();if (done) break;
      size += value.length;if (size > 8192) { await reader.cancel();throw new Error("invalid_request"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
  return value as Record<string, unknown>;
}
function requestHash(request: Request, email: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("unavailable");
  // Trust forwarded IPs only behind the deployed Vercel edge, not arbitrary local/proxy headers.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-forwarded-for")?.trim() : null;
  const client = ip && isIP(ip) ? ip : "shared-untrusted-origin";
  const digest = (type: string, value: string) => createHmac("sha256", secret).update(`auth-form:${type}:${value}`).digest("hex");
  return { client: digest("client", client), email: digest("email", email) };
}
function redirectUrl(request: Request, locale: Locale, operation: Operation) {
  const path = operation === "register" ? "/login" : "/reset-password";
  // Preserve the initiating local origin for PKCE, even if local env points at production.
  if (process.env.NODE_ENV === "development") return new URL(localizedPath(path, locale), requestOrigin(request)).href;
  return operation === "register" ? getLocalizedSiteUrl(path, locale) : getResetPasswordRedirectUrl(locale);
}
function duplicate() {
  console.info("[AUTH] Registration attempt: Account already exists");
  return reply({ success: false, code: "account_exists" }, 409);
}
export async function handleAuthForm(request: Request, operation: Operation) {
  try {
    let body;
    try { body = await parse(request); } catch (error) {
      const forbidden = error instanceof Error && error.message === "forbidden";
      return reply({ success: false, code: forbidden ? "forbidden" : "invalid_request" }, forbidden ? 403 : 400);
    }
    const allowed = operation === "register" ? ["email", "locale", "password", "fullName", "phone", "marketingEmailConsent"] : ["email", "locale"];
    if (Object.keys(body).some(key => !allowed.includes(key)) || !isLocale(body.locale)) return reply({ success: false, code: "invalid_request" }, 400);
    const email = normalizeAuthEmail(body.email);
    if (!email || email.length > 254 || !isValidEmail(email)) return reply({ success: false, code: "invalid_email" }, 400);
    if (operation === "register") {
      if (typeof body.password !== "string" || validatePassword(body.password)) return reply({ success: false, code: "invalid_password" }, 400);
      if (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.length > 200 || typeof body.phone !== "string" || !body.phone.trim() || body.phone.length > 80 || typeof body.marketingEmailConsent !== "boolean") return reply({ success: false, code: "invalid_request" }, 400);
    }
    const db = createAdminClient(), hashes = requestHash(request, email);
    const { data: retry, error: budgetError } = await db.rpc("consume_auth_form_budget", { p_action: operation, p_client_hash: hashes.client, p_email_hash: hashes.email });
    if (budgetError || typeof retry !== "number" || !Number.isFinite(retry) || retry < 0) throw budgetError ?? new Error("unavailable");
    if (retry > 0) return reply({ success: false, code: "rate_limited" }, 429, { "Retry-After": String(Math.ceil(retry)) });
    const { data: exists, error: lookupError } = await db.rpc("auth_form_account_exists", { p_email: email });
    if (lookupError || typeof exists !== "boolean") throw lookupError ?? new Error("unavailable");
    if (operation === "forgot-password") {
      if (!exists) {
        console.info("[AUTH] Password reset: Account not found");
        return reply({ success: true });
      }
      // Existing SSR client persists the PKCE recovery verifier in the browser's response cookies.
      try {
        const supabase = await createClient();
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl(request, body.locale, operation) });
        if (error) console.warn("[AUTH] Password reset request was not accepted", safeLogDetails(error));
        else console.info("[AUTH] Password reset: Email is sent");
      } catch (error) {
        console.warn("[AUTH] Password reset request was not accepted", safeLogDetails(error));
      }
      // Match nonexistent-account responses, including provider errors/rate limits. No existence flag.
      return reply({ success: true });
    }
    if (exists) return duplicate();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email, password: body.password as string,
      options: { emailRedirectTo: redirectUrl(request, body.locale, operation), data: {
        preferred_locale: body.locale, full_name: (body.fullName as string).trim(), phone: (body.phone as string).trim(), marketing_email_consent: body.marketingEmailConsent,
      } },
    });
    if (error) {
      if (["user_already_exists", "email_exists"].includes(error.code ?? "") || /already (?:been )?registered/i.test(error.message)) return duplicate();
      console.warn("[AUTH] Registration request was not accepted", safeLogDetails(error));
      return reply({ success: false, code: isRateLimitError(error) ? "rate_limited" : "unavailable" }, isRateLimitError(error) ? 429 : 503);
    }
    // Supabase may obfuscate a concurrently-created confirmed account instead of returning an error.
    if (data.user?.identities?.length === 0) return duplicate();
    if (!data.user) throw new Error("unavailable");
    return reply({ success: true, hasSession: Boolean(data.session) });
  } catch (error) {
    console.error("[AUTH] Form request failed", safeLogDetails(error));
    return reply({ success: false, code: "unavailable" }, 503);
  }
}
