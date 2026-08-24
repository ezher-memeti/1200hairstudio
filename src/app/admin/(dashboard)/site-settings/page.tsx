import { redirect } from "next/navigation";

export default function AdminSiteSettingsIndexPage() {
  redirect("/admin/site-settings/services");
}
