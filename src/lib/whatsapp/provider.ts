import "server-only";

export class WhatsAppError extends Error {
  constructor(
    public readonly code: "not_configured" | "invalid_recipient" | "provider_rejected" | "provider_unavailable" | "provider_timeout" | "invalid_provider_response",
    public readonly status: number,
  ) {
    super(code);
    this.name = "WhatsAppError";
  }
}

export function normalizeTestRecipient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/^\+/, "");
  return /^[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

function getConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const version = process.env.WHATSAPP_API_VERSION?.trim();
  const entries = process.env.WHATSAPP_TEST_RECIPIENTS?.split(",") ?? [];
  const recipients = entries.map(normalizeTestRecipient);
  if (
    !token || !phoneNumberId || !/^\d{5,30}$/.test(phoneNumberId) ||
    !businessAccountId || !/^\d{5,30}$/.test(businessAccountId) ||
    !version || !/^v\d{1,3}\.0$/.test(version) ||
    !recipients.length || recipients.some((recipient) => recipient === null)
  ) {
    throw new WhatsAppError("not_configured", 503);
  }
  return { token, phoneNumberId, version, recipients };
}

export function validateWhatsAppTestRecipient(recipient: unknown): string {
  const config = getConfig();
  const to = normalizeTestRecipient(recipient);
  if (!to || !config.recipients.includes(to)) throw new WhatsAppError("invalid_recipient", 400);
  return to;
}

// Deliberately limited to Meta's approved, parameter-free test template.
// WABA ID is validated above, but /messages is addressed by phone-number ID.
export async function sendWhatsAppTest(recipient: unknown): Promise<{ messageId: string }> {
  const config = getConfig();
  const to = normalizeTestRecipient(recipient);
  if (!to || !config.recipients.includes(to)) {
    throw new WhatsAppError("invalid_recipient", 400);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.version}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: "hello_world", language: { code: "en_US" } },
        }),
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      },
    );
    // Do not surface Meta's raw error body: it can echo request details.
    if (!response.ok) throw new WhatsAppError("provider_rejected", 502);
    const data: unknown = await response.json();
    const messageId = (data as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
    if (typeof messageId !== "string" || !/^wamid\.[A-Za-z0-9+/_=-]{1,500}$/.test(messageId)) {
      throw new WhatsAppError("invalid_provider_response", 502);
    }
    return { messageId };
  } catch (error) {
    if (error instanceof WhatsAppError) throw error;
    if (controller.signal.aborted) throw new WhatsAppError("provider_timeout", 504);
    throw new WhatsAppError("provider_unavailable", 502);
  } finally {
    clearTimeout(timeout);
  }
}
