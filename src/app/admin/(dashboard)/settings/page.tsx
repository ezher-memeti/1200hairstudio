import AdminSettingsView from "@/components/admin/AdminSettingsView";
import { requireAdminUser } from "@/lib/auth/customer";
import { getAllAdminSettings } from "@/lib/admin/settings";

export default async function AdminSettingsPage() {
  const [{ user }, settings] = await Promise.all([requireAdminUser(), getAllAdminSettings()]);
  const gmailConnected = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  return <AdminSettingsView initialSettings={settings} adminEmail={user.email ?? ""} gmailConnected={gmailConnected} />;
}
