// Console diagnostics must never serialize provider errors, requests or user input.
// Keep fixed call-site labels, machine error codes, HTTP status and internal job
// references. In particular, message/details/hint/stack/cause are not log fields.
export function safeLogDetails(value: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!value || typeof value !== "object") return result;
  try {
    const record = value as Record<string, unknown>;
    const code = record.code;
    if (typeof code === "string" && (/^(?:[0-9]{2}[A-Z0-9]{3}|PGRST[0-9]{3}|P000[0-4])$/.test(code) || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EEXIST", "EACCES", "ENOENT", "invalid_grant", "invalid_client"].includes(code))) result.code = code;
    const response = record.response;
    const status = record.status ?? record.statusCode ?? (response && typeof response === "object" ? (response as Record<string, unknown>).status : undefined);
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) result.httpStatus = status;
    const name = record.name;
    if (typeof name === "string" && ["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError"].includes(name)) result.kind = name;
    for (const [key, allowed] of Object.entries({ operation: ["insert", "update", "create", "delete"], channel: ["email", "whatsapp"], status: ["processing", "sent", "delivered", "read", "failed", "skipped"], event: ["paused", "resumed", "removed"] })) {
      const field = record[key];
      if (typeof field === "string" && allowed.includes(field)) result[key] = field;
    }
    for (const key of ["hasBookingReference", "hasManagementTokenHash"]) {
      const flag = record[key];
      if (typeof flag === "boolean") result[key] = flag;
    }
    const attemptCount = record.attemptCount;
    if (typeof attemptCount === "number" && Number.isInteger(attemptCount) && attemptCount >= 0 && attemptCount <= 100) result.attemptCount = attemptCount;
    // Internal correlation references only; never customer/profile IDs, booking
    // references, management tokens, recipient addresses or provider message IDs.
    for (const key of ["appointmentId", "emailLogId", "reminderId", "recurringBookingId", "campaignId", "recipientId", "serviceId", "promotionId", "templateId", "announcementId"]) {
      const reference = record[key];
      if (typeof reference === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(reference)) result[key] = reference;
    }
    for (const key of ["error", "deliveryError"]) {
      const nested = record[key];
      if (nested && typeof nested === "object" && nested !== value) {
        const fields = nested as Record<string, unknown>;
        // Deliberately inspect just one level; do not recurse into arbitrary
        // payloads or SDK response/config objects (which can contain secrets).
        const response = fields.response;
        const status = fields.status ?? fields.statusCode ?? (response && typeof response === "object" ? (response as Record<string, unknown>).status : undefined);
        const details = safeLogDetails({ code: fields.code, status, name: fields.name });
        if (Object.keys(details).length) result[key] = details;
      }
    }
  } catch {
    // Malformed provider errors must not interrupt the original error handling.
  }
  return result;
}
