import "server-only";
import { getCurrentUserRole } from "@/lib/auth/customer";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeLogDetails } from "@/lib/logging";
import { isPushId } from "./preferences";
import { pushConfigured, validateSubscription } from "./provider";
import { processAdminPush } from "./worker";
function reply(value: object, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } }); }
function fail(code: string, status: number) { return reply({ success: false, code }, status); }
async function input(request: Request) {
  if (request.headers.get("x-admin-push") !== "1" || (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("forbidden");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("invalid_request");
  const reader = request.body?.getReader();if (!reader) throw new Error("invalid_request");
  let length = 0;const chunks: Uint8Array[] = [];
  try { while (true) { const { done, value } = await reader.read();if (done) break;length += value.length;if (length > 8192) { await reader.cancel();throw new Error("invalid_request"); }chunks.push(value); } }
  finally { reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_request");
  return body as Record<string, unknown>;
}
export async function handlePushApi(request: Request, operation: "status" | "subscribe" | "unsubscribe" | "test") {
  try {
    const { user, role } = await getCurrentUserRole();
    if (!user) return fail("unauthenticated", 401);
    if (role !== "admin") return fail("forbidden", 403);
    const db = createAdminClient();
    if (operation === "status") {
      const { data, error } = await db.from("admin_push_subscriptions").select("id,active,vapid_public_key").eq("admin_user_id", user.id);
      if (error) return fail("queue_unavailable", 503);
      // Never return subscription endpoints or encryption keys to the browser.
      return reply({ success: true, configured: pushConfigured(), devices: data ?? [] });
    }
    let body: Record<string, unknown>;
    try { body = await input(request); } catch (error) { return error instanceof Error && error.message === "forbidden" ? fail("forbidden", 403) : fail("invalid_request", 400); }
    if (operation === "subscribe") {
      if (!pushConfigured()) return fail("not_configured", 503);
      if (Object.keys(body).some(key => !["subscription", "locale", "replaceId"].includes(key)) || !["de", "en"].includes(String(body.locale)) || (body.replaceId != null && !isPushId(body.replaceId))) return fail("invalid_request", 400);
      let subscription;
      try { subscription = validateSubscription(body.subscription); } catch { return fail("invalid_subscription", 400); }
      const { data, error } = await db.rpc("admin_push_subscribe", { p_admin: user.id, p_endpoint: subscription.endpoint, p_p256dh: subscription.p256dh, p_auth: subscription.auth, p_public_key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(), p_locale: body.locale, p_expires: subscription.expires, p_replace: body.replaceId ?? null });
      if (error || !isPushId(data)) return fail("subscription_unavailable", 409);
      return reply({ success: true, id: data });
    }
    if (Object.keys(body).some(key => key !== "id") || !isPushId(body.id)) return fail("invalid_request", 400);
    if (operation === "unsubscribe") {
      const { error } = await db.from("admin_push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", body.id).eq("admin_user_id", user.id);
      if (error) return fail("queue_unavailable", 503);
      return reply({ success: true });
    }
    if (!pushConfigured()) return fail("not_configured", 503);
    const { data, error } = await db.rpc("admin_push_test", { p_admin: user.id, p_subscription: body.id });
    if (error) return fail("queue_unavailable", 503);
    if (!isPushId(data)) return fail("test_limited_or_inactive", 429);
    // Explicit test action: await only this administrator's one targeted test delivery.
    const result = await processAdminPush(data);
    return reply({ success: true, ...result }, 202);
  } catch (error) {
    console.error("ADMIN PUSH API FAILED", safeLogDetails(error));
    return fail("internal_error", 503);
  }
}
