import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AppointmentReminderSettings = {
  id: string | null;
  enabled: boolean;
  hoursBefore: number;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
};

export const DEFAULT_APPOINTMENT_REMINDER_SETTINGS: AppointmentReminderSettings = {
  id: null,
  enabled: false,
  hoursBefore: 2,
  emailEnabled: true,
  whatsappEnabled: false,
};

export function normalizeAppointmentReminderSettings(row: Record<string, unknown> | null): AppointmentReminderSettings {
  const hours = Number(row?.appointment_reminder_hours_before ?? 2);
  return {
    id: typeof row?.id === "string" ? row.id : null,
    enabled: row?.appointment_reminders_enabled === true,
    hoursBefore: Number.isInteger(hours) && hours >= 1 && hours <= 720 ? hours : 2,
    emailEnabled: row?.appointment_reminder_email_enabled !== false,
    whatsappEnabled: row?.appointment_reminder_whatsapp_enabled === true,
  };
}

export async function getAppointmentReminderSettings() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_settings")
    .select("id,appointment_reminders_enabled,appointment_reminder_hours_before,appointment_reminder_email_enabled,appointment_reminder_whatsapp_enabled")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Unable to load appointment reminder settings.");
  return normalizeAppointmentReminderSettings(data as Record<string, unknown> | null);
}
