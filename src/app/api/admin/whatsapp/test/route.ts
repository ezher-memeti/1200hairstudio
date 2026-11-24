import { getCurrentUserRole } from "@/lib/auth/customer";
import { sendWhatsAppTest, validateWhatsAppTestRecipient, WhatsAppError } from "@/lib/whatsapp/provider";
import { consumeWhatsAppTestAttempt } from "@/lib/whatsapp/test-rate-limit";

import { prepareWhatsAppTest, recordWhatsAppTest, failWhatsAppTest } from "@/lib/whatsapp/deliveries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(code: string, status: number, headers?: Record<string, string>) {
  return Response.json({ success: false, error: { code } }, {
    status, headers: { "Cache-Control": "no-store", ...headers },
  });
}

async function readInput(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new Error("invalid_request");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await getCurrentUserRole();
    if (!user) return failure("unauthenticated", 401);
    if (role !== "admin") return failure("forbidden", 403);
    if (process.env.WHATSAPP_TEST_ENABLED !== "true") return failure("test_disabled", 503);

    // Custom header + JSON prevents cross-site form submissions. No CORS grant.
    // Also reject foreign origins when a browser supplies an Origin header.
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) ||
      request.headers.get("x-whatsapp-test") !== "1") return failure("forbidden", 403);
    const retryAfter = consumeWhatsAppTestAttempt();
    if (retryAfter) return failure("rate_limited", 429, { "Retry-After": String(retryAfter) });
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return failure("invalid_request", 400);
    }
    let input: unknown;
    try { input = await readInput(request); } catch { return failure("invalid_request", 400); }
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !("recipient" in input)) return failure("invalid_request", 400);
    const recipient = validateWhatsAppTestRecipient(input.recipient);
    let outboxId: string;
    try { outboxId = await prepareWhatsAppTest(recipient); }
    catch { return failure("persistence_unavailable", 503); }
    let messageId: string;
    try { ({ messageId } = await sendWhatsAppTest(recipient)); }
    catch (error) { await failWhatsAppTest(outboxId); throw error; }
    const persisted = await recordWhatsAppTest(outboxId, messageId);
    if (!persisted) console.warn("WHATSAPP TEST PERSISTENCE FAILED", { code: "accepted_not_fully_recorded" });
    // Meta already accepted it. A database failure must NOT suggest resending.
    return Response.json({ success: true, messageId, outboxId, status: "accepted", persisted,
      ...(persisted ? {} : { warning: "accepted_not_fully_recorded_do_not_resend" }) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof WhatsAppError) {
      console.warn("WHATSAPP TEST FAILED", { code: error.code });
      return failure(error.code, error.status);
    }
    // Never log exception text, headers, payloads, credentials, or recipients.
    console.warn("WHATSAPP TEST FAILED", { code: "internal_error" });
    return failure("internal_error", 500);
  }
}
