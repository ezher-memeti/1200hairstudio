import ContactSection from "./ContactSection";
import type { ContactSectionSettings } from "@/lib/contact-section/types";
import { getGoogleReviews } from "@/lib/google-reviews/server";

export default async function ContactSectionLoader({ settings }: { settings: ContactSectionSettings }) {
  // Shares the reviews section's request-scoped Places response; no click-time fetch.
  const place = settings.isEnabled && settings.googleReviewsEnabled && settings.leaveReviewCtaLabel.trim()
    ? await getGoogleReviews()
    : null;
  return <ContactSection settings={{ ...settings, googleLeaveReviewUrl: place?.writeUri ?? "" }} />;
}
