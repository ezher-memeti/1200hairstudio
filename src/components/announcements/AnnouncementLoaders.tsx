import AnnouncementBar from "@/components/announcements/AnnouncementBar";
import AnnouncementModal from "@/components/announcements/AnnouncementModal";
import BookingAnnouncement from "@/components/announcements/BookingAnnouncement";
import { getActiveAnnouncements, selectAnnouncement } from "@/lib/announcements/queries";

export async function AnnouncementBarLoader() {
  const announcements = await getActiveAnnouncements();
  return <AnnouncementBar announcement={selectAnnouncement(announcements, "top_bar")} />;
}

export async function BookingAnnouncementLoader() {
  const announcements = await getActiveAnnouncements();
  return <BookingAnnouncement announcement={selectAnnouncement(announcements, "booking_notice")} />;
}

export async function AnnouncementModalLoader() {
  const announcements = await getActiveAnnouncements();
  return <AnnouncementModal announcement={selectAnnouncement(announcements, "modal")} />;
}
