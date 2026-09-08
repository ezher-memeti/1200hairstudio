"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validatePassword } from "@/lib/auth/shared";
import {
  PAYMENT_METHODS,
  type BookingSettings,
  type BusinessSettings,
  type FinanceSettings,
  type NotificationSettings,
  updateAdminSetting,
} from "@/lib/admin/settings";
import type { AppointmentReminderSettings } from "@/lib/reminders/settings";

type BusinessHourUpdate = {
  id: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
};


async function requireAdminClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error("Unauthorized");
  }

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
    throw new Error("Unauthorized");
  }

  return supabase;
}

function toActionError(error: unknown) {
  if (error instanceof Error) {
    return { error: error.message };
  }

  return { error: "Unexpected server error." };
}

type SettingsActionResult = { success: boolean; message: string };

function cleanText(value: string) {
  return value.trim();
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function success(section: string): SettingsActionResult {
  revalidatePath("/admin/settings");
  return { success: true, message: `${section} settings saved.` };
}

export async function saveBusinessSettings(input: BusinessSettings): Promise<SettingsActionResult> {
  try {
    const value: BusinessSettings = {
      businessName: cleanText(input.businessName), addressLine: cleanText(input.addressLine), postalCode: cleanText(input.postalCode), city: cleanText(input.city), region: cleanText(input.region), country: cleanText(input.country), phone: cleanText(input.phone), email: cleanText(input.email).toLowerCase(), website: cleanText(input.website), timezone: cleanText(input.timezone), currency: "CHF",
    };
    if (!value.businessName || !value.addressLine || !value.postalCode || !value.city || !value.country) return { success: false, message: "Complete the required business details." };
    if (!validEmail(value.email)) return { success: false, message: "Enter a valid business email." };
    if (!validUrl(value.website)) return { success: false, message: "Enter a valid website URL." };
    if (!validTimezone(value.timezone)) return { success: false, message: "Select a valid timezone." };
    await updateAdminSetting("business", value);
    return success("Business");
  } catch (error) { return { success: false, message: toActionError(error).error }; }
}

export async function saveBookingSettings(input: BookingSettings): Promise<SettingsActionResult> {
  try {
    const integers = [input.slotIntervalMinutes, input.minimumNoticeHours, input.maximumHorizonDays, input.cancellationCutoffHours];
    if (!integers.every(Number.isInteger)) return { success: false, message: "Booking values must be whole numbers." };
    if (input.slotIntervalMinutes < 5 || input.slotIntervalMinutes > 240) return { success: false, message: "Slot interval must be between 5 and 240 minutes." };
    if (input.minimumNoticeHours < 0 || input.minimumNoticeHours > 720) return { success: false, message: "Minimum notice must be between 0 and 720 hours." };
    if (input.maximumHorizonDays < 1 || input.maximumHorizonDays > 730) return { success: false, message: "Booking horizon must be between 1 and 730 days." };
    if (input.cancellationCutoffHours < 0 || input.cancellationCutoffHours > 720) return { success: false, message: "Cancellation cutoff must be between 0 and 720 hours." };
    await updateAdminSetting("booking", input);
    return success("Booking");
  } catch (error) { return { success: false, message: toActionError(error).error }; }
}

export async function saveNotificationSettings(input: NotificationSettings): Promise<SettingsActionResult> {
  try {
    const value = { ...input, senderName: cleanText(input.senderName) };
    if (!value.senderName) return { success: false, message: "Sender name is required." };
    if (value.senderName.length > 100) return { success: false, message: "Sender name is too long." };
    await updateAdminSetting("notifications", value);
    return success("Notification");
  } catch (error) { return { success: false, message: toActionError(error).error }; }
}

export async function saveAppointmentReminderSettings(input: AppointmentReminderSettings): Promise<SettingsActionResult> {
  try {
    if (!Number.isInteger(input.hoursBefore) || input.hoursBefore < 1 || input.hoursBefore > 720) return { success: false, message: "Reminder timing must be between 1 and 720 whole hours." };
    const supabase = await requireAdminClient();
    const payload = {
      appointment_reminders_enabled: input.enabled,
      appointment_reminder_hours_before: input.hoursBefore,
      appointment_reminder_email_enabled: input.emailEnabled,
      appointment_reminder_whatsapp_enabled: input.whatsappEnabled,
    };
    const { data: existing, error: loadError } = await supabase.from("notification_settings").select("id").limit(1).maybeSingle();
    if (loadError) throw new Error("Unable to load reminder settings.");
    const query = existing?.id ? supabase.from("notification_settings").update(payload).eq("id", existing.id) : supabase.from("notification_settings").insert(payload);
    const { error } = await query;
    if (error) throw new Error("Unable to save reminder settings.");
    return success("Appointment reminder");
  } catch (error) { return { success: false, message: toActionError(error).error }; }
}

export async function saveFinanceSettings(input: FinanceSettings): Promise<SettingsActionResult> {
  try {
    if (input.currency !== "CHF") return { success: false, message: "The current finance system supports CHF only." };
    if (!["day", "week", "month"].includes(input.defaultReportGrouping)) return { success: false, message: "Select a valid report grouping." };
    const methods = [...new Set(input.enabledPaymentMethods)];
    if (!methods.length || methods.some((method) => !PAYMENT_METHODS.includes(method))) return { success: false, message: "Select at least one valid payment method." };
    await updateAdminSetting("finance", { ...input, enabledPaymentMethods: methods });
    return success("Finance");
  } catch (error) { return { success: false, message: toActionError(error).error }; }
}

export async function changeAdminPassword(password: string, confirmation: string): Promise<SettingsActionResult> {
  try {
    if (password !== confirmation) return { success: false, message: "Passwords do not match." };
    const passwordError = validatePassword(password);
    if (passwordError) return { success: false, message: passwordError };
    const supabase = await requireAdminClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { success: false, message: "Unable to update your password." };
    return { success: true, message: "Password updated successfully." };
  } catch (error) { return { success: false, message: toActionError(error).error }; }
}

export async function updateBusinessHours(
  updates: BusinessHourUpdate[],
) {
  try {
    const supabase = await requireAdminClient();

    for (const update of updates) {
      const values = {
        is_closed: update.is_closed,
        open_time: update.is_closed ? null : update.open_time,
        close_time: update.is_closed ? null : update.close_time,
      };

      const { error } = await supabase
        .from("business_hours")
        .update(values)
        .eq("id", update.id);

      if (error) {
        return { error: error.message };
      }
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin/site-settings/business-hours");
    return { error: null };
  } catch (error) {
    return toActionError(error);
  }
}
