"use server";

import { revalidatePath } from "next/cache";
import { ensureCustomerRecord, requireCustomerUser } from "@/lib/auth/customer";
import type { AppointmentRecord } from "@/lib/appointments/types";
import {
  cancelResolvedAppointment,
  getResolvedAppointmentSlots,
  rescheduleResolvedAppointment,
} from "@/lib/appointments/managed-mutations";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeRecurringAppointmentOccurrence } from "@/lib/recurring-bookings/service";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected server error.";
}

async function resolveOwnedAppointment(appointmentId: string) {
  const { supabase, user } = await requireCustomerUser();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (customerError || !customer) return null;

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (appointmentError || !appointment) return null;
  return appointment as AppointmentRecord;
}

export async function getAccountBookingSlots(appointmentId: string, dateKey: string) {
  try {
    const appointment = await resolveOwnedAppointment(appointmentId);
    if (!appointment) return { error: "Booking not found.", slots: [] };
    return getResolvedAppointmentSlots(appointment, dateKey);
  } catch (error) {
    return { error: toErrorMessage(error), slots: [] };
  }
}

export async function rescheduleAccountBooking(appointmentId: string, dateKey: string, startTime: string) {
  try {
    const appointment = await resolveOwnedAppointment(appointmentId);
    if (!appointment) return { error: "Booking not found.", emailWarning: null };
    return rescheduleResolvedAppointment(appointment, dateKey, startTime);
  } catch (error) {
    return { error: toErrorMessage(error), emailWarning: null };
  }
}

export async function cancelAccountBooking(appointmentId: string) {
  try {
    const appointment = await resolveOwnedAppointment(appointmentId);
    if (!appointment) return { error: "Booking not found.", emailWarning: null };
    return cancelResolvedAppointment(appointment);
  } catch (error) {
    return { error: toErrorMessage(error), emailWarning: null };
  }
}

export async function removeAccountRecurringAppointment(appointmentId: string) {
  try {
    const appointment = await resolveOwnedAppointment(appointmentId);
    if (!appointment?.recurring_booking_id) return { error: "Recurring appointment not found." };
    await removeRecurringAppointmentOccurrence(appointment.id);
    revalidatePath("/account");
    revalidatePath("/");
    revalidatePath("/admin/appointments");
    revalidatePath("/admin/calendar");
    return { error: null };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateCustomerAccount(formData: FormData) {
  try {
    const fullName = (formData.get("fullName") ?? "").toString().trim();
    const phone = (formData.get("phone") ?? "").toString().trim();

    if (!fullName) {
      return { error: "Full name is required." };
    }

    const { supabase, user } = await requireCustomerUser();
    await ensureCustomerRecord(fullName, phone);

    const { error } = await supabase
      .from("customers")
      .update({
        full_name: fullName,
        phone,
      })
      .eq("profile_id", user.id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/account");
    return { error: null };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function subscribeToMarketingEmails() {
  try {
    const { supabase, user } = await requireCustomerUser();
    const consentedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("customers")
      .update({
        marketing_email_consent: true,
        marketing_email_consented_at: consentedAt,
        marketing_email_consent_source: "account_preferences",
        marketing_email_unsubscribed_at: null,
      })
      .eq("profile_id", user.id)
      .select("marketing_email_consent, marketing_email_consented_at, marketing_email_consent_source, marketing_email_unsubscribed_at")
      .single();

    if (error || !data) return { error: "Unable to update email preferences right now.", preference: null };
    revalidatePath("/account");
    return { error: null, preference: data };
  } catch (error) {
    return { error: toErrorMessage(error), preference: null };
  }
}

export async function unsubscribeFromMarketingEmails() {
  try {
    const { supabase, user } = await requireCustomerUser();
    const unsubscribedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("customers")
      .update({
        marketing_email_consent: false,
        marketing_email_unsubscribed_at: unsubscribedAt,
      })
      .eq("profile_id", user.id)
      .select("marketing_email_consent, marketing_email_consented_at, marketing_email_consent_source, marketing_email_unsubscribed_at")
      .single();

    if (error || !data) return { error: "Unable to update email preferences right now.", preference: null };
    revalidatePath("/account");
    return { error: null, preference: data };
  } catch (error) {
    return { error: toErrorMessage(error), preference: null };
  }
}

export async function deleteCustomerAccount() {
  try {
    const { user } = await requireCustomerUser();
    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.auth.admin.deleteUser(user.id);

    if (error) {
      console.error("Customer account deletion failed", error);
      return { error: "Your account could not be deleted right now." };
    }

    return { error: null };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
