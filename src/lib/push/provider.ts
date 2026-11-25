import "server-only";
import { createECDH, ECDH } from "node:crypto";
import { sendNotification } from "web-push";

export type StoredSubscription = { endpoint: string; p256dh: string; auth_key: string; vapid_public_key: string };
export function pushConfigured() {
  try {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim(), priv = process.env.VAPID_PRIVATE_KEY?.trim(), subject = process.env.VAPID_SUBJECT?.trim();
    if (!pub || !priv || !subject || Buffer.from(priv, "base64url").length !== 32) return false;
    const contact = new URL(subject);
    if (!["mailto:", "https:"].includes(contact.protocol) || contact.username || contact.password || contact.search || contact.hash || (contact.protocol === "mailto:" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.pathname))) return false;
    const key = createECDH("prime256v1");key.setPrivateKey(Buffer.from(priv, "base64url"));
    return key.getPublicKey().toString("base64url") === pub;
  } catch { return false; }
}
export function validateSubscription(value: unknown): { endpoint: string; p256dh: string; auth: string; expires: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_subscription");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !["endpoint", "keys", "expirationTime"].includes(key))) throw new Error("invalid_subscription");
  if (typeof record.endpoint !== "string" || record.endpoint.length > 2000) throw new Error("invalid_subscription");
  const url = new URL(record.endpoint);
  // Prevent server-side requests to arbitrary URLs/private hosts. Only browser push services.
  const allowed = url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
    url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com") ||
    url.hostname === "wns.windows.com" || url.hostname.endsWith(".wns.windows.com") || url.hostname.endsWith(".notify.windows.com");
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) throw new Error("invalid_subscription");
  const keys = record.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || Object.keys(keys).some(key => !["auth", "p256dh"].includes(key))) throw new Error("invalid_subscription");
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(keys.auth) || Buffer.from(keys.p256dh, "base64url").length !== 65 || Buffer.from(keys.auth, "base64url").length !== 16) throw new Error("invalid_subscription");
  try { ECDH.convertKey(Buffer.from(keys.p256dh, "base64url"), "prime256v1"); } catch { throw new Error("invalid_subscription"); }
  const expiration = record.expirationTime;
  if (expiration != null && (typeof expiration !== "number" || !Number.isFinite(expiration) || expiration <= Date.now() || expiration > 253402300799999)) throw new Error("invalid_subscription");
  return { endpoint: url.href, p256dh: keys.p256dh, auth: keys.auth, expires: typeof expiration === "number" ? new Date(expiration).toISOString() : null };
}
export type PushResult = { status: "SENT" | "RETRY" | "FAILED" | "EXPIRED" | "UNKNOWN"; code: string | null };
export function classifyPushFailure(error: unknown): PushResult {
  const status = error && typeof error === "object" && "statusCode" in error ? error.statusCode : null;
  if (status === 404 || status === 410) return { status: "EXPIRED", code: "expired" };
  if (status === 429) return { status: "RETRY", code: "rate_limited" };
  if (typeof status === "number" && status >= 500 && status <= 599) return { status: "RETRY", code: "provider" };
  if (status === 401 || status === 403) return { status: "FAILED", code: "authorization" };
  if (typeof status === "number") return { status: "FAILED", code: "invalid_subscription" };
  // Timeouts/disconnects may happen after acceptance. Never automatically resend them.
  return { status: "UNKNOWN", code: "network_unknown" };
}
export async function sendWebPush(subscription: StoredSubscription, payload: object): Promise<PushResult> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (subscription.vapid_public_key !== publicKey) return { status: "FAILED", code: "key_mismatch" };
  try {
    try { validateSubscription({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }); }
    catch { return { status: "FAILED", code: "invalid_subscription" }; }
    await sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, JSON.stringify(payload), {
      vapidDetails: { subject: process.env.VAPID_SUBJECT!.trim(), publicKey: publicKey!, privateKey: process.env.VAPID_PRIVATE_KEY!.trim() },
      TTL: 3600, urgency: "high", timeout: 8000,
    });
    return { status: "SENT", code: null };
  } catch (error) { return classifyPushFailure(error); }
}
