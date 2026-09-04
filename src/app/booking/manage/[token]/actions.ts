"use server";

import {
  cancelResolvedAppointment,
  getResolvedAppointmentSlots,
  rescheduleResolvedAppointment,
} from "@/lib/appointments/managed-mutations";
import {
  clearGuestBookingCookie,
  hashManagementToken,
  resolveManagedAppointment,
} from "@/lib/appointments/management";

const INVALID_LINK_MESSAGE = "This booking could not be found or this management link is no longer valid.";

export async function getManagedBookingSlots(token: string, dateKey: string) {
  const managed = await resolveManagedAppointment(token);
  if (!managed) return { error: INVALID_LINK_MESSAGE, slots: [] };
  return getResolvedAppointmentSlots(managed.appointment, dateKey);
}

export async function cancelManagedBooking(token: string) {
  const managed = await resolveManagedAppointment(token);
  if (!managed) return { error: INVALID_LINK_MESSAGE, emailWarning: null };

  const result = await cancelResolvedAppointment(managed.appointment, {
    manageTokenHash: hashManagementToken(token),
  });
  if (!result.error) await clearGuestBookingCookie(token);
  return result;
}

export async function rescheduleManagedBooking(token: string, dateKey: string, startTime: string) {
  const managed = await resolveManagedAppointment(token);
  if (!managed) return { error: INVALID_LINK_MESSAGE, emailWarning: null };

  return rescheduleResolvedAppointment(managed.appointment, dateKey, startTime, {
    manageTokenHash: hashManagementToken(token),
  });
}
