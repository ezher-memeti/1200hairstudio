import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const TEST_EVENT = "WHATSAPP_TEST";
export const WHATSAPP_PROVIDER = "META_WHATSAPP";
export type DeliveryStatus = "SENT" | "DELIVERED" | "READ" | "FAILED";
export type StatusEvent = { messageId: string; recipient: string; status: DeliveryStatus; at: string; errorCode?: number };
type Delivery = { id: string; status: DeliveryStatus; sent_at: string | null; delivered_at: string | null; read_at: string | null; error_message: string | null };
const columns = "id,status,sent_at,delivered_at,read_at,error_message";
const rank: Record<DeliveryStatus, number> = { SENT: 1, FAILED: 2, DELIVERED: 3, READ: 4 };

export async function prepareWhatsAppTest(recipient: string) {
  const db = createAdminClient();
  // Never put a test in PENDING/PROCESSING: generic workers must not send it.
  const { data, error } = await db.from("notification_outbox").insert({
    event_type: TEST_EVENT, channel: "WHATSAPP", recipient, status: "CANCELLED",
    attempts: 1, idempotency_key: `whatsapp-test:${randomUUID()}`,
    payload: { test: true, template: "hello_world", language: "en_US" },
  }).select("id").single();
  if (error || !data) throw new Error("test_persistence_unavailable");
  return data.id as string;
}

export async function recordWhatsAppTest(outboxId: string, messageId: string): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { error } = await db.from("notification_deliveries").insert({
      outbox_id: outboxId, provider: WHATSAPP_PROVIDER, provider_message_id: messageId,
      status: "SENT", // Schema has no ACCEPTED status; sent_at waits for Meta's event.
    });
    if (error) return false;
    const completed = await db.from("notification_outbox").update({ status: "COMPLETED", updated_at: new Date().toISOString() })
      .eq("id", outboxId).eq("event_type", TEST_EVENT).eq("status", "CANCELLED").select("id");
    return !completed.error && completed.data?.length === 1;
  } catch { return false; }
}

export async function failWhatsAppTest(outboxId: string) {
  try {
    await createAdminClient().from("notification_outbox").update({ status: "FAILED", updated_at: new Date().toISOString() })
      .eq("id", outboxId).eq("event_type", TEST_EVENT).eq("status", "CANCELLED");
  } catch { /* A failed/ambiguous provider attempt is never queued or retried here. */ }
}

export function deliveryPatch(row: Delivery, event: StatusEvent) {
  const patch: Partial<Delivery> = {};
  // Delivery/read evidence wins over failure; failure wins over a late sent receipt.
  // Do not overwrite an existing failure's details on replay.
  if (rank[event.status] > rank[row.status]) {
    patch.status = event.status;
    patch.error_message = event.status === "FAILED"
      ? (event.errorCode === undefined ? `meta_delivery_failed at ${event.at}` : `meta_error_${event.errorCode} at ${event.at}`) : null;
  }
  const field = event.status === "SENT" ? "sent_at" : event.status === "DELIVERED" ? "delivered_at" : event.status === "READ" ? "read_at" : null;
  if (field && (!row[field] || event.at < row[field])) patch[field] = event.at;
  return patch;
}

export async function applyWhatsAppStatus(event: StatusEvent): Promise<"updated" | "ignored"> {
  const db = createAdminClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db.from("notification_deliveries")
      .select(`${columns},outbox:notification_outbox!inner(event_type,channel,recipient,payload)`)
      .eq("provider", WHATSAPP_PROVIDER).eq("provider_message_id", event.messageId)
      .eq("outbox.event_type", TEST_EVENT).eq("outbox.channel", "WHATSAPP")
      .eq("outbox.recipient", event.recipient).eq("outbox.payload->>test", "true").limit(2);
    if (error || (data && data.length > 1)) throw new Error("delivery_lookup_failed");
    if (!data?.length) {
      // A receipt can beat the post-send INSERT. Ask Meta to retry briefly
      // while a matching test send is in flight, instead of losing that receipt.
      const pending = await db.from("notification_outbox").select("id")
        .eq("event_type", TEST_EVENT).eq("channel", "WHATSAPP").eq("recipient", event.recipient)
        .eq("payload->>test", "true").eq("status", "CANCELLED")
        .gte("created_at", new Date(Date.now() - 120_000).toISOString()).limit(1);
      if (pending.error || pending.data?.length) throw new Error("delivery_persistence_pending");
      return "ignored";
    }
    const row = data[0] as Delivery;
    if (!(row.status in rank)) throw new Error("invalid_delivery_state");
    const patch = deliveryPatch(row, event);
    if (!Object.keys(patch).length) return "ignored";
    let query = db.from("notification_deliveries").update(patch).eq("id", row.id)
      .eq("provider", WHATSAPP_PROVIDER).eq("provider_message_id", event.messageId).eq("status", row.status);
    // Compare-and-swap ALL mutable fields, so parallel events cannot overwrite
    // a newer status or erase another event's timestamp. No read-then-blind-write.
    for (const field of ["sent_at", "delivered_at", "read_at", "error_message"] as const) {
      query = row[field] === null ? query.is(field, null) : query.eq(field, row[field]);
    }
    const updated = await query.select("id");
    if (updated.error) throw new Error("delivery_update_failed");
    if (updated.data?.length) return "updated";
  }
  throw new Error("delivery_contention"); // 503 -> Meta can retry, never resend a message.
}
