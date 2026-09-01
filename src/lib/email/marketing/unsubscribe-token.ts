import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

type TokenPayload = { customerId: string; expiresAt: number };

function getSigningSecret() {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error("Missing unsubscribe signing secret.");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
}

export function createMarketingUnsubscribeToken(customerId: string) {
  const payload = Buffer.from(
    JSON.stringify({ customerId, expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 } satisfies TokenPayload),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyMarketingUnsubscribeToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
    if (!parsed.customerId || parsed.expiresAt < Date.now()) return null;
    return parsed.customerId;
  } catch {
    return null;
  }
}
