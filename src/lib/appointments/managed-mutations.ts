import { safeLogDetails } from "@/lib/logging";
import { getLocale } from "next-intl/server";
import "server-only";

import { revalidatePath } from "next/cache";
import { formatZurichDate, formatZurichTimeRange } from "@/lib/appointments/availability";
import { validateAppointmentRequest } from "@/lib/appointments/mutations";
import type { AppointmentRecord } from "@/lib/appointments/types";
import { sendBookingCancellationEmail, sendBookingUpdateEmail } from "@/lib/email/transactional";
import { getAvailableSlots, mapAvailableSlotsForDisplay } from "@/lib/public/available-slots";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomerManagementCapabilities, validateCustomerBookingTime } from "@/lib/booking/policy";
import { getBookingSettings } from "@/lib/booking/settings";
import { getNotificationSettings } from "@/lib/admin/runtime-settings";
import { APPOINTMENT_TIME_CONFLICT_MESSAGE, isAppointmentTimeConflictError } from "@/lib/appointments/write-errors";

function revalidateAppointmentViews() {
  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath("/admin/appointments");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/customers");
}

async function getEmailDetails(appointment: AppointmentRecord) {
  const supabase = createAdminClient();
  const [{ data: customer }, { data: service }] = await Promise.all([
    appointment.customer_id
      ? supabase.from("customers").select("full_name, email").eq("id", appointment.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("services").select("name, name_de, price").eq("id", appointment.service_id).maybeSingle(),
  ]);

  return {
    customerName: customer?.full_name ?? appointment.customer_name ?? appointment.guest_name ?? "Customer",
    customerEmail: customer?.email ?? appointment.customer_email ?? appointment.guest_email ?? "",
    serviceName: service?.name ?? "Service",
    serviceNameDe: service?.name_de,
    price: Number(appointment.final_price ?? appointment.original_price ?? service?.price ?? 0),
  };
}

export async function getResolvedAppointmentSlots(appointment: AppointmentRecord, dateKey: string) {
  const settings = await getBookingSettings();
  const capabilities = getCustomerManagementCapabilities(appointment, settings);
  if (!capabilities.canReschedule) return { error: capabilities.rescheduleBlockedReason ?? "This booking can no longer be changed.", slots: [] };

  const slots = await getAvailableSlots(appointment.service_id, dateKey, {
    excludeAppointmentId: appointment.id,
    bookingSettings: settings,
    enforceCustomerPolicy: true,
  });
  return { error: null, slots: mapAvailableSlotsForDisplay(slots) };
}

export async function cancelResolvedAppointment(
  appointment: AppointmentRecord,
  options?: { manageTokenHash?: string },
) {
  const settings = await getBookingSettings();
  const capabilities = getCustomerManagementCapabilities(appointment, settings);
  if (!capabilities.canCancel) return { error: capabilities.cancellationBlockedReason ?? "This booking can no longer be cancelled.", emailWarning: null };

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let query = supabase
    .from("appointments")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", appointment.id);

  if (options?.manageTokenHash) query = query.eq("manage_token_hash", options.manageTokenHash);

  const { data: updatedAppointment, error } = await query
    .select("id, status, cancelled_at")
    .maybeSingle();

  if (error || !updatedAppointment) {
    console.error("CUSTOMER BOOKING CANCELLATION ERROR", safeLogDetails({ appointmentId: appointment.id, code: error?.code ?? null }));
    return { error: "Unable to cancel this booking right now. Please contact the studio.", emailWarning: null };
  }

  let emailWarning: string | null = null;
  const details = await getEmailDetails(appointment);
  const notificationSettings = await getNotificationSettings();
  if (details.customerEmail && notificationSettings.cancellationEmail) {
    try {
      await sendBookingCancellationEmail({
        to: details.customerEmail,
        customerId: appointment.customer_id,
        appointmentId: appointment.id,
        customerName: details.customerName,
        serviceName: details.serviceName,
        serviceNameDe: details.serviceNameDe,
        startAt: appointment.start_at,
        endAt: appointment.end_at,
        price: details.price,
      });
    } catch (emailError) {
      emailWarning = "The booking was cancelled, but the notification email could not be sent.";
      console.error("CUSTOMER BOOKING CANCELLATION EMAIL ERROR", safeLogDetails(emailError));
    }
  }

  revalidateAppointmentViews();
  return { error: null, emailWarning, updatedAppointment };
}

export async function rescheduleResolvedAppointment(
  appointment: AppointmentRecord,
  dateKey: string,
  startTime: string,
  options?: { manageTokenHash?: string },
) {
  const settings = await getBookingSettings();
  const capabilities = getCustomerManagementCapabilities(appointment, settings);
  if (!capabilities.canReschedule) return { error: capabilities.rescheduleBlockedReason ?? "This booking can no longer be changed.", emailWarning: null };

  const supabase = createAdminClient();
  const validation = await validateAppointmentRequest(supabase, {
    serviceId: appointment.service_id,
    dateKey,
    startTime,
    excludeAppointmentId: appointment.id,
  }, { customerBookingSettings: settings });

  if (validation.error || !validation.service) {
    return { error: validation.error ?? "This time is no longer available.", emailWarning: null };
  }

  const finalPolicyError = validateCustomerBookingTime(validation.startAt, dateKey, settings);
  if (finalPolicyError) return { error: finalPolicyError, emailWarning: null };

  let query = supabase
    .from("appointments")
    .update({
      start_at: validation.startAt,
      end_at: validation.endAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointment.id);

  if (options?.manageTokenHash) query = query.eq("manage_token_hash", options.manageTokenHash);

  const { data: updatedAppointment, error } = await query
    .select("id, booking_reference, start_at, end_at, status, updated_at")
    .maybeSingle();

  if (error || !updatedAppointment) {
    console.error("CUSTOMER BOOKING RESCHEDULE ERROR", safeLogDetails({ appointmentId: appointment.id, code: error?.code ?? null }));
    return {
      error: isAppointmentTimeConflictError(error)
        ? APPOINTMENT_TIME_CONFLICT_MESSAGE
        : "Unable to change this booking right now. Please choose another time.",
      emailWarning: null,
    };
  }

  let emailWarning: string | null = null;
  const details = await getEmailDetails(appointment);
  const notificationSettings = await getNotificationSettings();
  if (details.customerEmail && notificationSettings.rescheduleEmail) {
    try {
      await sendBookingUpdateEmail({
        to: details.customerEmail,
        customerId: appointment.customer_id,
        appointmentId: appointment.id,
        customerName: details.customerName,
        serviceName: validation.service.name,
        serviceNameDe: validation.service.name_de,
        startAt: updatedAppointment.start_at,
        endAt: updatedAppointment.end_at,
        price: details.price,
      });
    } catch (emailError) {
      emailWarning = "The booking was updated, but the notification email could not be sent.";
      console.error("CUSTOMER BOOKING UPDATE EMAIL ERROR", safeLogDetails(emailError));
    }
  }

  revalidateAppointmentViews();
  return {
    error: null,
    emailWarning,
    updatedAppointment: {
      ...updatedAppointment,
      date: formatZurichDate(updatedAppointment.start_at, await getLocale()),
      time: formatZurichTimeRange(updatedAppointment.start_at, updatedAppointment.end_at),
    },
  };
}
