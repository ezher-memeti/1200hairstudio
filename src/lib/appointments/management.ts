import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppointmentRecord } from "@/lib/appointments/types";
import { getSiteUrl } from "@/lib/auth/url";
import { cookies } from "next/headers";

const BOOKING_REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TOKEN_BYTES = 32;
export const GUEST_BOOKING_COOKIE = "1200_guest_booking";

export function generateBookingReference() {
  let suffix = "";

  for (let index = 0; index < 6; index += 1) {
    suffix += BOOKING_REFERENCE_ALPHABET[randomInt(BOOKING_REFERENCE_ALPHABET.length)];
  }

  return `1200-${suffix}`;
}

export function generateManagementToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashManagementToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidManagementToken(token: string) {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

export function createBookingCredentials() {
  const managementToken = generateManagementToken();

  return {
    bookingReference: generateBookingReference(),
    managementToken,
    managementTokenHash: hashManagementToken(managementToken),
  };
}

export function getBookingManagementUrl(token: string) {
  return `${getSiteUrl()}/booking/manage/${encodeURIComponent(token)}`;
}

export async function getGuestBookingToken() {
  return (await cookies()).get(GUEST_BOOKING_COOKIE)?.value ?? null;
}

export async function setGuestBookingCookie(token: string) {
  (await cookies()).set(GUEST_BOOKING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearGuestBookingCookie(expectedToken?: string) {
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(GUEST_BOOKING_COOKIE)?.value;

  if (expectedToken && currentToken !== expectedToken) {
    return;
  }

  cookieStore.set(GUEST_BOOKING_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export function isActiveManagedAppointment(appointment: AppointmentRecord, now = Date.now()) {
  return appointment.status === "confirmed" && new Date(appointment.end_at).getTime() > now;
}

export async function resolveManagedAppointment(token: string) {
  if (!isValidManagementToken(token)) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("manage_token_hash", hashManagementToken(token))
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    supabase,
    appointment: data as AppointmentRecord,
  };
}
