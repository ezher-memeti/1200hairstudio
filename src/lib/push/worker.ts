import "server-only";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import de from "../../../messages/de.json";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeLogDetails } from "@/lib/logging";
import { pushConfigured, sendWebPush, type StoredSubscription } from "./provider";
export type PushClaim = StoredSubscription & { id: string; claim_token: string; event_id: string; kind: string; starts_at: string | null; locale: string; attempts: number };
export function pushPayload(row: PushClaim) {
  const locale = row.locale === "en" ? "en" : "de";
  const t = createTranslator({ locale, messages: locale === "en" ? en.push : de.push });
  const kind = ["customer_registered", "appointment_confirmed", "appointment_completed", "test"].includes(row.kind) ? row.kind as "customer_registered" | "appointment_confirmed" | "appointment_completed" | "test" : "test";
  const date = row.starts_at ? new Date(row.starts_at) : null;
  const time = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hour12: false }).format(date) : "";
  return { id: row.event_id, title: t(`${kind}_title`), body: kind === "appointment_confirmed" && time ? t("appointment_time", { time }) : t(`${kind}_body`), url: `/${locale}/admin/push/${row.event_id}` };
}
export async function processAdminPush(deliveryId?: string) {
  if (!pushConfigured()) throw new Error("not_configured");
  const db = createAdminClient();
  const { data, error } = await db.rpc("admin_push_claim", { p_limit: 8, p_delivery: deliveryId ?? null });
  if (error) throw new Error("queue_unavailable");
  const results = await Promise.all(((data ?? []) as PushClaim[]).map(async row => {
    const result = await sendWebPush(row, pushPayload(row));
    const { data: recorded, error: recordError } = await db.rpc("admin_push_finish", { p_id: row.id, p_token: row.claim_token, p_status: result.status, p_error: result.code });
    if (recordError || !recorded) {
      console.error("ADMIN PUSH RESULT NOT RECORDED", safeLogDetails({ error: recordError }));
      return "UNKNOWN";
    }
    return result.status;
  }));
  return { processed: results.length, accepted: results.filter(x => x === "SENT").length, retrying: results.filter(x => x === "RETRY").length, uncertain: results.filter(x => x === "UNKNOWN").length, failed: results.filter(x => ["FAILED", "EXPIRED"].includes(x)).length };
}
