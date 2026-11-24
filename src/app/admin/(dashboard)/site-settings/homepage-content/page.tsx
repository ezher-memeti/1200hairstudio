import { ContentEditor } from "@/components/admin/content/AdminContentLocale";
import HomepageContentManager from "@/components/admin/HomepageContentManager";
import { requireAdminUser } from "@/lib/auth/customer";
import { getAdminHomepageContent } from "@/lib/homepage-content";

export const dynamic = "force-dynamic";

export default async function AdminSiteSettingsHomepageContentPage() {
  await requireAdminUser();
  const data = await getAdminHomepageContent();
  return <ContentEditor>{<HomepageContentManager {...data} />}</ContentEditor>;
}

