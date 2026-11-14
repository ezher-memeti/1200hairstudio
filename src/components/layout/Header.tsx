import { Suspense } from "react";
import HeaderClient from "@/components/layout/HeaderClient";
import { AnnouncementBarLoader } from "@/components/announcements/AnnouncementLoaders";

export default function Header() {
  return <div className="sticky top-0 z-50"><HeaderClient authLink={{ label: "LOGIN", href: "/login" }} announcementBar={<Suspense fallback={null}><AnnouncementBarLoader /></Suspense>} /></div>;
}
