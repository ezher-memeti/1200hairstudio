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
  const { supabase } = await requireCustomerUser();
  const customer = await ensureCustomerRecord();

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

    const { supabase } = await requireCustomerUser();
    await ensureCustomerRecord(fullName, phone);

    const { error } = await supabase.rpc("update_my_customer_profile", {
      p_full_name: fullName,
      p_phone: phone,
    });

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
    const { supabase } = await requireCustomerUser();
    const { data, error } = await supabase.rpc("set_my_marketing_email_preference", {
      p_subscribed: true,
      p_source: "account_preferences",
    });
    const preference = Array.isArray(data) ? data[0] : data;

    if (error || !preference) return { error: "Unable to update email preferences right now.", preference: null };
    revalidatePath("/account");
    return { error: null, preference };
  } catch (error) {
    return { error: toErrorMessage(error), preference: null };
  }
}

export async function unsubscribeFromMarketingEmails() {
  try {
    const { supabase } = await requireCustomerUser();
    const { data, error } = await supabase.rpc("set_my_marketing_email_preference", {
      p_subscribed: false,
      p_source: "account_preferences",
    });
    const preference = Array.isArray(data) ? data[0] : data;

    if (error || !preference) return { error: "Unable to update email preferences right now.", preference: null };
    revalidatePath("/account");
    return { error: null, preference };
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
