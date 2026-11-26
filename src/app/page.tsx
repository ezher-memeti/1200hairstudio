import { getBusinessSettings } from "@/lib/admin/runtime-settings";
import { getLocale } from "next-intl/server";
import { resolveLocale } from "@/i18n/config";
import { getSiteUrl } from "@/lib/auth/url";
import { businessStructuredData, serializeJsonLd } from "@/lib/seo/business";
import { getBusinessHours } from "@/lib/public/business-hours";
import { Suspense } from "react";
import GoogleReviewsSection, { GoogleReviewsPlaceholder } from "@/components/home/GoogleReviewsSection";
import BookingSection from "@/components/home/BookingSection";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/home/Hero";
import MeetTheBarber from "@/components/home/MeetTheBarber";
import SelectedWork from "@/components/home/SelectedWork";
import ServicesSection from "@/components/home/ServicesSection";
import ScrollVideoSection from "@/components/home/ScrollVideoSection";
import SectionTwo from "@/components/home/SectionTwo";
import ContactSectionLoader from "@/components/home/ContactSectionLoader";
import VisitStudio from "@/components/home/VisitStudio";
import { AnnouncementModalLoader, BookingAnnouncementLoader } from "@/components/announcements/AnnouncementLoaders";
import { getHomepageContent } from "@/lib/homepage-content";
import { getPublicContactSectionSettings } from "@/lib/contact-section/settings";

export default async function Home() {
  const [content, contactSettings, businessHours, locale, business] = await Promise.all([
    getHomepageContent(),
    getPublicContactSectionSettings(),
    getBusinessHours(),
    getLocale(),
    getBusinessSettings(),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(businessStructuredData(getSiteUrl(), resolveLocale(locale), content, contactSettings, businessHours, business)) }} />
      <Header />

      <main>
        <ScrollVideoSection>
          <Hero content={content} />
          <Suspense fallback={<GoogleReviewsPlaceholder />}>
            <GoogleReviewsSection />
          </Suspense>
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
          <Suspense fallback={null}>
            <ContactSectionLoader settings={contactSettings} />
          </Suspense>
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
