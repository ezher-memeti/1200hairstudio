import BookingSection from "@/components/home/BookingSection";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/home/Hero";
import MeetTheBarber from "@/components/home/MeetTheBarber";
import SelectedWork from "@/components/home/SelectedWork";
import ServicesSection from "@/components/home/ServicesSection";
import ScrollVideoSection from "@/components/home/ScrollVideoSection";
import SectionTwo from "@/components/home/SectionTwo";
import ContactSection from "@/components/home/ContactSection";
import VisitStudio from "@/components/home/VisitStudio";
import BookingAnnouncement from "@/components/announcements/BookingAnnouncement";
import AnnouncementModal from "@/components/announcements/AnnouncementModal";
import { getActiveAnnouncements, selectAnnouncement } from "@/lib/announcements/queries";
import { getHomepageContent } from "@/lib/homepage-content";
import { getPublicContactSectionSettings } from "@/lib/contact-section/settings";

export default async function Home() {

  console.time("HOME_TOTAL");

  const announcementsPromise = (async () => {
    console.time("getActiveAnnouncements");
    const result = await getActiveAnnouncements();
    console.timeEnd("getActiveAnnouncements");
    return result;
  })();

  const contentPromise = (async () => {
    console.time("getHomepageContent");
    const result = await getHomepageContent();
    console.timeEnd("getHomepageContent");
    return result;
  })();

  const contactPromise = (async () => {
    console.time("getPublicContactSectionSettings");
    const result = await getPublicContactSectionSettings();
    console.timeEnd("getPublicContactSectionSettings");
    return result;
  })();

  const [announcements, content, contactSettings] = await Promise.all([
    announcementsPromise,
    contentPromise,
    contactPromise,
  ]);

  console.timeEnd("HOME_TOTAL");

  // existing return...
  // const [announcements, content, contactSettings] = await Promise.all([getActiveAnnouncements(), getHomepageContent(), getPublicContactSectionSettings()]);

  return (
    <>
      <Header />
      <main>
        <ScrollVideoSection>
          <Hero content={content} />
          <SectionTwo content={content} />
        </ScrollVideoSection>
        <ServicesSection content={content} />
        <BookingAnnouncement announcement={selectAnnouncement(announcements, "booking_notice")} />
        <BookingSection content={content} />
        <SelectedWork content={content} />
        <MeetTheBarber content={content} />
        {contactSettings ? <ContactSection settings={contactSettings} /> : null}
        <VisitStudio content={content} directionsUrl={contactSettings?.mapUrl} />
      </main>
      <Footer content={content} />
      <AnnouncementModal announcement={selectAnnouncement(announcements, "modal")} />
    </>
  );
}
