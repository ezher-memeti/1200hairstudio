import { redirect } from "@/i18n/server";

export default async function AdminSiteSettingsIndexPage() {
  return await redirect("/admin/site-settings/services");
}
