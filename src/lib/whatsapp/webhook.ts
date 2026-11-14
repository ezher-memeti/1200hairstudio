import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizeTestRecipient } from "@/lib/whatsapp/provider";
import type { StatusEvent, DeliveryStatus } from "@/lib/whatsapp/deliveries";

export function secureTokenEqual(actual: string, expected: string) {
  return timingSafeEqual(createHash("sha256").update(actual).digest(), createHash("sha256").update(expected).digest());
}
export function validWhatsAppSignature(raw: Buffer, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(raw).digest(), Buffer.from(signature.slice(7), "hex"));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_payload");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("invalid_payload");
  return value;
}

export function parseWhatsAppStatuses(payload: unknown): StatusEvent[] {
  const root = object(payload);
  if (typeof root.object !== "string") throw new Error("invalid_payload");
  if (root.object !== "whatsapp_business_account") return [];
  const events: StatusEvent[] = [];
  const account = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const recipients = (process.env.WHATSAPP_TEST_RECIPIENTS?.split(",") ?? []).map(normalizeTestRecipient);
  if (!account || !phoneId || !recipients.length || recipients.some((r) => !r)) throw new Error("not_configured");
  for (const entryValue of array(root.entry)) {
    const entry = object(entryValue);
    if (entry.id !== account) continue;
    for (const changeValue of array(entry.changes)) {
      const change = object(changeValue);
      if (change.field !== "messages") continue;
      const value = object(change.value);
      if (value.messaging_product !== "whatsapp") throw new Error("invalid_payload");
      const metadata = object(value.metadata);
      if (metadata.phone_number_id !== phoneId) continue;
      if (value.statuses === undefined) continue; // Inbound messages: no auto-replies.
      for (const statusValue of array(value.statuses)) {
        const status = object(statusValue);
        if (!['sent', 'delivered', 'read', 'failed'].includes(String(status.status))) continue;
        if (typeof status.id !== "string" || !/^wamid\.[A-Za-z0-9+/_=-]{1,500}$/.test(status.id) ||
          typeof status.timestamp !== "string" || !/^\d{1,12}$/.test(status.timestamp)) throw new Error("invalid_payload");
        const timestamp = Number(status.timestamp) * 1000;
        if (timestamp <= 0 || timestamp > Date.now() + 300_000) throw new Error("invalid_payload");
        const recipient = normalizeTestRecipient(status.recipient_id);
        if (!recipient) throw new Error("invalid_payload");
        if (!recipients.includes(recipient)) continue;
        let errorCode: number | undefined;
        if (Array.isArray(status.errors) && status.errors.length) {
          const code = object(status.errors[0]).code;
          if (Number.isSafeInteger(code) && Number(code) >= 0 && Number(code) <= 999999999) errorCode = Number(code);
        }
        events.push({ messageId: status.id, recipient, status: String(status.status).toUpperCase() as DeliveryStatus,
          at: new Date(timestamp).toISOString(), errorCode });
        if (events.length > 100) throw new Error("invalid_payload");
      }
    }
  }
  return events;
}
