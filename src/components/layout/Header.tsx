import HeaderClient from "@/components/layout/HeaderClient";
import { getCurrentUserRole } from "@/lib/auth/customer";
import AnnouncementBar from "@/components/announcements/AnnouncementBar";
import { getActiveAnnouncements, selectAnnouncement } from "@/lib/announcements/queries";

type HeaderAuthLink = {
  label: "LOGIN" | "MY PROFILE" | "ADMIN DASHBOARD";
  href: "/login" | "/account" | "/admin";
};

async function getHeaderAuthLink(): Promise<HeaderAuthLink> {
  const { user, role } = await getCurrentUserRole();

  if (!user) {
    return {
      label: "LOGIN",
      href: "/login",
    };
  }

  if (role === "admin") {
    return {
      label: "ADMIN DASHBOARD",
      href: "/admin",
    };
  }

  return {
    label: "MY PROFILE",
    href: "/account",
  };
}

export default async function Header() {
  const [authLink, announcements] = await Promise.all([getHeaderAuthLink(), getActiveAnnouncements()]);

  return <div className="sticky top-0 z-50"><HeaderClient authLink={authLink} announcementBar={<AnnouncementBar announcement={selectAnnouncement(announcements, "top_bar")} />} /></div>;
}
