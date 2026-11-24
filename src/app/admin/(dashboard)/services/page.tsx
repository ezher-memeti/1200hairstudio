import { redirect } from "@/i18n/server";

export default async function AdminServicesPage() {
  return await redirect("/admin/site-settings/services");
}
