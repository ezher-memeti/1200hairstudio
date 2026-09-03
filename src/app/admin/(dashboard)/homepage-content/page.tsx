import { redirect } from "next/navigation";

export default function LegacyAdminHomepageContentPage() {
  redirect("/admin/site-settings/homepage-content");
}
