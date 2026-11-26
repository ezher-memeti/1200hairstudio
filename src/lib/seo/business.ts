import { DEFAULT_BUSINESS_SETTINGS } from "@/lib/business/identity";
import type { BusinessSettings } from "@/lib/admin/settings";
import type { HomepageContent } from "@/lib/homepage-content-defaults";
import type { ContactSectionSettings } from "@/lib/contact-section/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import type { Locale } from "@/i18n/config";
import { homepageDescriptions } from "./metadata";

function httpsUrl(value: string | undefined) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function businessStructuredData(origin: string, locale: Locale, content: HomepageContent, contact: ContactSectionSettings | null, hours: BusinessHourRecord[], business: BusinessSettings = DEFAULT_BUSINESS_SETTINGS) {
  const address = {
    "@type": "PostalAddress", streetAddress: business.addressLine, postalCode: business.postalCode,
    addressLocality: business.city, addressRegion: business.region,
    addressCountry: /^(Switzerland|Schweiz|CH)$/i.test(business.country) ? "CH" : business.country,
  };
  const phone = business.phone.replace(/[\s().-]/g, "");
  const instagram = contact?.isEnabled && contact.instagramEnabled ? httpsUrl(contact.instagramUrl) : undefined;
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const openingHoursSpecification = hours.flatMap(hour => {
    if (hour.is_closed || !days[hour.day_of_week - 1] || !/^\d{2}:\d{2}(?::\d{2})?$/.test(hour.open_time ?? "") || !/^\d{2}:\d{2}(?::\d{2})?$/.test(hour.close_time ?? "")) return [];
    return [{ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${days[hour.day_of_week - 1]}`, opens: hour.open_time!.slice(0, 5), closes: hour.close_time!.slice(0, 5) }];
  });
  return {
    "@context": "https://schema.org", "@type": "HairSalon", "@id": `${origin}/#business`, name: business.businessName, email: business.email, url: `${origin}/${locale}`,
    description: homepageDescriptions[locale], slogan: "MORE THAN A HAIRCUT.", image: `${origin}/images/barber.webp`, logo: `${origin}/brand/logo.png`,
    ...(address ? { address } : {}), ...(/^\+\d{8,15}$/.test(phone) ? { telephone: phone } : {}),
    ...(instagram ? { sameAs: [instagram] } : {}), ...(openingHoursSpecification.length ? { openingHoursSpecification } : {}),
  };
}
// Supabase-managed public text must never terminate the script element.
export function serializeJsonLd(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
