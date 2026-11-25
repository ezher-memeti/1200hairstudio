import AdminSettingsView from "@/components/admin/AdminSettingsView";
import { requireAdminUser } from "@/lib/auth/customer";
import { getAllAdminSettings } from "@/lib/admin/settings";
import { getAppointmentReminderSettings } from "@/lib/reminders/settings";
export default async function NotificationsPage() {
  const [{user},settings,reminders]=await Promise.all([requireAdminUser(),getAllAdminSettings(),getAppointmentReminderSettings()]);
  return <AdminSettingsView initialSection="notifications" initialSettings={settings} initialReminderSettings={reminders} adminEmail={user.email??""} gmailConnected={Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.GOOGLE_REFRESH_TOKEN)} />;
}
