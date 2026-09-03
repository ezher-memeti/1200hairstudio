import AnnouncementsManager from "@/components/admin/AnnouncementsManager";
import { getAdminAnnouncements } from "@/lib/announcements/queries";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  try {
    return <AnnouncementsManager announcements={await getAdminAnnouncements()} />;
  } catch (error) {
    console.error("Unable to load admin announcements", error);
    return <AnnouncementsManager announcements={[]} loadError="Announcements could not be loaded." />;
  }
}
