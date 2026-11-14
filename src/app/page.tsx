import { Suspense } from "react";
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
import { AnnouncementModalLoader, BookingAnnouncementLoader } from "@/components/announcements/AnnouncementLoaders";
import { getHomepageContent } from "@/lib/homepage-content";
import { getPublicContactSectionSettings } from "@/lib/contact-section/settings";

export default async function Home() {
  const homeDataStartedAt = performance.now();

  const [content, contactSettings] = await Promise.all([
    timed("getHomepageContent", getHomepageContent),
    timed(
      "getPublicContactSectionSettings",
      getPublicContactSectionSettings
    ),
  ]);

  console.log(`HOME_DATA: ${(performance.now() - homeDataStartedAt).toFixed(3)}ms`);

  return (
    <>
      <Header />

      <main>
        <ScrollVideoSection>
          <Hero content={content} />
          <SectionTwo content={content} />
        </ScrollVideoSection>

        <ServicesSection content={content} />

        <Suspense fallback={null}>
          <BookingAnnouncementLoader />
        </Suspense>

        <BookingSection content={content} />

        <SelectedWork content={content} />

        <MeetTheBarber content={content} />

        {contactSettings && (
          <ContactSection settings={contactSettings} />
        )}

        <VisitStudio
          content={content}
          directionsUrl={contactSettings?.mapUrl}
        />
      </main>

      <Footer content={content} />

      <Suspense fallback={null}>
        <AnnouncementModalLoader />
      </Suspense>
    </>
  );
}

async function timed<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now();

  try {
    return await fn();
  } finally {
    console.log(`${name}: ${(performance.now() - startedAt).toFixed(3)}ms`);
  }
}
