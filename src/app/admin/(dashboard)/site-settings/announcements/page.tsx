import { ContentEditor } from "@/components/admin/content/AdminContentLocale";
import AnnouncementsManager from "@/components/admin/AnnouncementsManager";
import { getAdminAnnouncements } from "@/lib/announcements/queries";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  try {
    return <ContentEditor><AnnouncementsManager announcements={await getAdminAnnouncements()} /></ContentEditor>;
  } catch (error) {
    console.error("Unable to load admin announcements", error);
    return <ContentEditor>{<AnnouncementsManager announcements={[]} loadError="Announcements could not be loaded." />}</ContentEditor>;
  }
}
