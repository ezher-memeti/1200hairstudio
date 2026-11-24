import type { HomepageContent } from "@/lib/homepage-content-defaults";
import type { ContactSectionSettings } from "@/lib/contact-section/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import type { Locale } from "@/i18n/config";
import { homepageDescriptions } from "./metadata";

function httpsUrl(value: string | undefined) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function businessStructuredData(origin: string, locale: Locale, content: HomepageContent, contact: ContactSectionSettings | null, hours: BusinessHourRecord[]) {
  // Match the address displayed by VisitStudio/Footer; do not geocode or infer coordinates.
  const locality = content.visit_address_line_2.trim().match(/^(\d{4})\s+(.+)$/);
  const address = locality && content.visit_address_line_1.trim() ? {
    "@type": "PostalAddress", streetAddress: content.visit_address_line_1.trim(), postalCode: locality[1], addressLocality: locality[2], addressCountry: "CH",
  } : undefined;
  const phone = contact?.isEnabled && contact.callCtaLabel.trim() ? contact.phoneNumber.replace(/[\s().-]/g, "") : "";
  const instagram = contact?.isEnabled && contact.instagramEnabled ? httpsUrl(contact.instagramUrl) : undefined;
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const openingHoursSpecification = hours.flatMap(hour => {
    if (hour.is_closed || !days[hour.day_of_week - 1] || !/^\d{2}:\d{2}(?::\d{2})?$/.test(hour.open_time ?? "") || !/^\d{2}:\d{2}(?::\d{2})?$/.test(hour.close_time ?? "")) return [];
    return [{ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${days[hour.day_of_week - 1]}`, opens: hour.open_time!.slice(0, 5), closes: hour.close_time!.slice(0, 5) }];
  });
  return {
    "@context": "https://schema.org", "@type": "HairSalon", "@id": `${origin}/#business`, name: "1200 HAIRSTUDIO", url: `${origin}/${locale}`,
    description: homepageDescriptions[locale], slogan: "MORE THAN A HAIRCUT.", image: `${origin}/images/barber.webp`, logo: `${origin}/brand/logo.png`,
    ...(address ? { address } : {}), ...(/^\+\d{8,15}$/.test(phone) ? { telephone: phone } : {}),
    ...(instagram ? { sameAs: [instagram] } : {}), ...(openingHoursSpecification.length ? { openingHoursSpecification } : {}),
  };
}
// Supabase-managed public text must never terminate the script element.
export function serializeJsonLd(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
