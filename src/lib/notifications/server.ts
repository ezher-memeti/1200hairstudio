import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/customer";
import { safeLogDetails } from "@/lib/logging";
import { isPushId } from "@/lib/push/preferences";
import { getZurichDateKeyFromIso } from "@/lib/appointments/date-utils";
import type { AdminNotification } from "./types";

const fields = "id,kind,entity_id,starts_at,booking_source,created_at,read_at";
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/;
function validTime(value: unknown): value is string {
  return typeof value === "string" && timestamp.test(value) && Number.isFinite(Date.parse(value));
}
export function encodeCursor(row: Pick<AdminNotification, "id" | "created_at">) {
  return Buffer.from(JSON.stringify({ at: row.created_at, id: row.id })).toString("base64url");
}
export function decodeCursor(value: string | null) {
  if (!value) return null;
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_request");
  const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (!cursor || !validTime(cursor.at) || !isPushId(cursor.id) || Object.keys(cursor).sort().join(",") !== "at,id") throw new Error("invalid_request");
  // Preserve PostgreSQL's microseconds: Date.toISOString() would lose cursor precision.
  return cursor as { at: string; id: string };
}
function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
async function mutationBody(request: Request) {
  if (request.headers.get("x-admin-notifications") !== "1" || request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)) throw new Error("forbidden");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();if (done) break;
      length += value.length;
      if (length > 1024) { await reader.cancel();throw new Error("invalid_request"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_request");
  return body as Record<string, unknown>;
}
export async function resolveNotificationTarget(db: ReturnType<typeof createAdminClient>, row: AdminNotification) {
  const fallback = row.kind === "customer_registered" ? "/admin/customers" : "/admin/appointments";
  if (!isPushId(row.entity_id)) return { href: fallback, missing: true };
  if (row.kind === "customer_registered") {
    const { data, error } = await db.from("customers").select("id").eq("profile_id", row.entity_id).maybeSingle();
    if (error) throw error;
    return data && isPushId(data.id) ? { href: `/admin/customers?customerId=${data.id}`, missing: false } : { href: "/admin/customers", missing: true };
  }
  if (row.kind === "appointment_confirmed" || row.kind === "appointment_completed") {
    const { data, error } = await db.from("appointments").select("id,start_at").eq("id", row.entity_id).maybeSingle();
    if (error) throw error;
    if (data && isPushId(data.id) && Number.isFinite(Date.parse(data.start_at))) {
      return { href: `/admin/appointments?view=day&date=${getZurichDateKeyFromIso(data.start_at)}&appointmentId=${data.id}&notification=${row.id}`, missing: false };
    }
    return { href: "/admin/appointments", missing: true };
  }
  return { href: "/admin", missing: true };
}
export async function handleNotifications(request: Request, operation: "list" | "count" | "read" | "read-all" | "open", id?: string) {
  try {
    const { user, role } = await getCurrentUserRole();
    if (!user) return reply({ success: false, code: "unauthenticated" }, 401);
    if (role !== "admin") return reply({ success: false, code: "forbidden" }, 403);
    const db = createAdminClient();
    if (operation === "count") {
      const { count, error } = await db.from("admin_notifications").select("id", { count: "exact", head: true }).eq("admin_user_id", user.id).is("read_at", null);
      if (error) throw error;
      return reply({ success: true, unread: count ?? 0 });
    }
    if (operation === "list") {
      const params = new URL(request.url).searchParams;
      let cursor;
      try { cursor = decodeCursor(params.get("cursor")); } catch { return reply({ success: false, code: "invalid_request" }, 400); }
      const filter = params.get("filter") ?? "all";
      if (!["all", "unread"].includes(filter) || [...params.keys()].some(key => !["filter", "cursor", "limit"].includes(key)) || (params.has("limit") && params.get("limit") !== "15")) return reply({ success: false, code: "invalid_request" }, 400);
      let query = db.from("admin_notifications").select(fields).eq("admin_user_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(16);
      if (filter === "unread") query = query.is("read_at", null);
      if (cursor) query = query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
      const { data, error } = await query;
      if (error) throw error;
      const items = (data ?? []).slice(0, 15) as AdminNotification[];
      return reply({ success: true, items, nextCursor: (data?.length ?? 0) > 15 ? encodeCursor(items[14]) : null });
    }
    let body;
    try { body = await mutationBody(request); } catch (error) {
      return reply({ success: false, code: error instanceof Error && error.message === "forbidden" ? "forbidden" : "invalid_request" }, error instanceof Error && error.message === "forbidden" ? 403 : 400);
    }
    if (operation === "read-all") {
      if (Object.keys(body).length) return reply({ success: false, code: "invalid_request" }, 400);
      const at = new Date().toISOString();
      const { error } = await db.from("admin_notifications").update({ read_at: at }).eq("admin_user_id", user.id).is("read_at", null).lte("created_at", at);
      if (error) throw error;
      return reply({ success: true });
    }
    if (!isPushId(id) || (operation === "read" ? typeof body.read !== "boolean" || Object.keys(body).some(key => key !== "read") : Object.keys(body).length > 0)) return reply({ success: false, code: "invalid_request" }, 400);
    // Every lookup and mutation is scoped to the authenticated owner, even with service-role access.
    if (operation === "open") {
      const { data, error } = await db.from("admin_notifications").select(fields).eq("admin_user_id", user.id).eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return reply({ success: false, code: "not_found" }, 404);
      const destination = await resolveNotificationTarget(db, data as AdminNotification);
      const { error: updateError } = await db.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("admin_user_id", user.id).eq("id", id).is("read_at", null);
      if (updateError) throw updateError;
      return reply({ success: true, ...destination });
    }
    const { data, error } = await db.from("admin_notifications").update({ read_at: body.read ? new Date().toISOString() : null }).eq("admin_user_id", user.id).eq("id", id).select("id,read_at").maybeSingle();
    if (error) throw error;
    return data ? reply({ success: true, item: data }) : reply({ success: false, code: "not_found" }, 404);
  } catch (error) {
    console.error("ADMIN INBOX REQUEST FAILED", safeLogDetails(error));
    return reply({ success: false, code: "unavailable" }, 503);
  }
}
