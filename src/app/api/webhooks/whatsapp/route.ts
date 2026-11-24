import { secureTokenEqual, validWhatsAppSignature, parseWhatsAppStatuses } from "@/lib/whatsapp/webhook";
import { applyWhatsAppStatus } from "@/lib/whatsapp/deliveries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function reply(code: string, status: number) {
  return Response.json({ success: status === 200, code }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: Request) {
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) return reply("not_configured", 503);
  const params = new URL(request.url).searchParams;
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (params.getAll("hub.mode").length !== 1 || params.getAll("hub.verify_token").length !== 1 ||
    params.getAll("hub.challenge").length !== 1 || params.get("hub.mode") !== "subscribe" ||
    !token || token.length > 1024 || !secureTokenEqual(token, expected) ||
    !challenge || !/^\d{1,100}$/.test(challenge)) return reply("forbidden", 403);
  return new Response(challenge, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return reply("not_configured", 503);
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return reply("invalid_signature", 401);
  let raw: Buffer;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply("invalid_payload", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 256 * 1024) { await reader.cancel(); return reply("payload_too_large", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    raw = Buffer.concat(chunks);
  } catch { return reply("invalid_payload", 400); }
  if (!validWhatsAppSignature(raw, signature, secret)) return reply("invalid_signature", 401);
  let events;
  try { events = parseWhatsAppStatuses(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw))); }
  catch (error) { return reply(error instanceof Error && error.message === "not_configured" ? "not_configured" : "invalid_payload", error instanceof Error && error.message === "not_configured" ? 503 : 400); }
  try {
    for (const event of events) await applyWhatsAppStatus(event);
    return reply("acknowledged", 200);
  } catch {
    console.warn("WHATSAPP WEBHOOK FAILED", { code: "delivery_persistence_failed" });
    return reply("delivery_persistence_failed", 503);
  }
}
