import { redirect } from "@/i18n/server";

export default async function LegacyAdminHomepageContentPage() {
  return await redirect("/admin/site-settings/homepage-content");
}
