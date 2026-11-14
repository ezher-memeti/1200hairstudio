import "server-only";

import { cache } from "react";
import {
  ADMIN_SETTING_KEYS,
  DEFAULT_ADMIN_SETTINGS,
  normalizeAdminSetting,
  type AdminSettings,
  type BusinessSettings,
  type FinanceSettings,
  type NotificationSettings,
} from "@/lib/admin/settings";
import { createAdminClient } from "@/lib/supabase/admin";

const loadRuntimeSettings = cache(async (): Promise<AdminSettings> => {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("admin_settings")
      .select("settings_key,settings_value")
      .in("settings_key", [...ADMIN_SETTING_KEYS]);
    if (error) throw error;
    const rows = new Map((data ?? []).map((row) => [row.settings_key, row.settings_value]));
    return {
      business: normalizeAdminSetting("business", rows.get("business")),
      booking: normalizeAdminSetting("booking", rows.get("booking")),
      notifications: normalizeAdminSetting("notifications", rows.get("notifications")),
      finance: normalizeAdminSetting("finance", rows.get("finance")),
    };
  } catch (error) {
    console.error("RUNTIME SETTINGS LOAD ERROR", error);
    return {
      ...DEFAULT_ADMIN_SETTINGS,
      // A failed settings read must not turn disabled email channels back on.
      notifications: {
        ...DEFAULT_ADMIN_SETTINGS.notifications,
        bookingConfirmationEmail: false,
        rescheduleEmail: false,
        cancellationEmail: false,
        receiptEmailEnabled: false,
        adminBookingNotification: false,
      },
    };
  }
});

export async function getBusinessSettings(): Promise<BusinessSettings> {
  return (await loadRuntimeSettings()).business;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return (await loadRuntimeSettings()).notifications;
}

export async function getFinanceSettings(): Promise<FinanceSettings> {
  return (await loadRuntimeSettings()).finance;
}

export async function getRuntimeSettings(): Promise<AdminSettings> {
  return loadRuntimeSettings();
}
