import BookingSection from "@/components/home/BookingSection";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/home/Hero";
import MeetTheBarber from "@/components/home/MeetTheBarber";
import SelectedWork from "@/components/home/SelectedWork";
import ServicesSection from "@/components/home/ServicesSection";
import ScrollVideoSection from "@/components/home/ScrollVideoSection";
import SectionTwo from "@/components/home/SectionTwo";
import VisitStudio from "@/components/home/VisitStudio";
import BookingAnnouncement from "@/components/announcements/BookingAnnouncement";
import AnnouncementModal from "@/components/announcements/AnnouncementModal";
import { getActiveAnnouncements, selectAnnouncement } from "@/lib/announcements/queries";
import { getHomepageContent } from "@/lib/homepage-content";

export default async function Home() {
  const [announcements, content] = await Promise.all([getActiveAnnouncements(), getHomepageContent()]);
  return (
    <>
      <Header />
      <main>
        <ScrollVideoSection>
          <Hero content={content} />
          <SectionTwo content={content} />
        </ScrollVideoSection>
        <ServicesSection content={content} />
        <MeetTheBarber content={content} />
        <SelectedWork content={content} />
        <BookingAnnouncement announcement={selectAnnouncement(announcements, "booking_notice")} />
        <BookingSection content={content} />
        <VisitStudio content={content} />
      </main>
      <Footer content={content} />
      <AnnouncementModal announcement={selectAnnouncement(announcements, "modal")} />
    </>
  );
}
