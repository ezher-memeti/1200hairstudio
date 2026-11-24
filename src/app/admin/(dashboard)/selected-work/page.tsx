import { redirect } from "@/i18n/server";

export default async function AdminSelectedWorkPage() {
  return await redirect("/admin/site-settings/selected-work");
}
