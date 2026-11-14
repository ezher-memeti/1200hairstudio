import "server-only";

// Global test budget per warm Node process, shared across admins and recipients.
// No user-controlled keys or unbounded memory. Consume before parsing or sending;
// failed/timeout attempts also count. Never automatically retry a send.
let startedAt = 0;
let attempts = 0;
export function consumeWhatsAppTestAttempt(now = Date.now()): number {
  if (!startedAt || now - startedAt >= 60_000) {
    startedAt = now;
    attempts = 0;
  }
  if (attempts >= 3) return Math.max(1, Math.ceil((startedAt + 60_000 - now) / 1000));
  attempts += 1;
  return 0;
}
