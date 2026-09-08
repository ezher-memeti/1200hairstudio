import AdminSettingsView from "@/components/admin/AdminSettingsView";
import { requireAdminUser } from "@/lib/auth/customer";
import { getAllAdminSettings } from "@/lib/admin/settings";
import { getAppointmentReminderSettings } from "@/lib/reminders/settings";

export default async function AdminSettingsPage() {
  const [{ user }, settings, reminderSettings] = await Promise.all([requireAdminUser(), getAllAdminSettings(), getAppointmentReminderSettings()]);
  const gmailConnected = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  return <AdminSettingsView initialSettings={settings} initialReminderSettings={reminderSettings} adminEmail={user.email ?? ""} gmailConnected={gmailConnected} />;
}
