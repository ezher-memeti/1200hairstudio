import type { Metadata } from "next";
import { localizedPath, type Locale } from "@/i18n/config";

// Only real public pages are eligible for indexing or language alternates.
export const indexablePaths = ["/", "/book", "/privacy", "/imprint"] as const;
export const homepageDescriptions = {
  de: "1200 HAIRSTUDIO in Salmsach, Thurgau. Präzise Herrenhaarschnitte, moderne Styles und persönliche Beratung. Jetzt online Termin buchen.",
  en: "Discover 1200 HAIRSTUDIO in Salmsach, Switzerland. Precision men's haircuts, modern styling and a personal barbershop experience. Book online.",
};
const pages: Record<string, Record<Locale, [string, string]>> = {
  "/": {
    de: ["1200 HAIRSTUDIO | Barbershop in Salmsach, Thurgau", homepageDescriptions.de],
    en: ["1200 HAIRSTUDIO | Men's Barbershop in Salmsach", homepageDescriptions.en],
  },
  "/book": {
    de: ["Termin buchen | 1200 HAIRSTUDIO Salmsach", "Wähle deine Dienstleistung und einen verfügbaren Termin bei 1200 HAIRSTUDIO in Salmsach. Preise in CHF und bequeme Online-Buchung."],
    en: ["Book an appointment | 1200 HAIRSTUDIO Salmsach", "Choose your service and an available appointment at 1200 HAIRSTUDIO in Salmsach. View prices in CHF and book your visit online."],
  },
  "/privacy": {
    de: ["Datenschutz | 1200 HAIRSTUDIO", "Informationen zum Datenschutz bei 1200 HAIRSTUDIO: Umgang mit personenbezogenen Daten, Online-Buchungen und deine Rechte."],
    en: ["Privacy policy | 1200 HAIRSTUDIO", "How 1200 HAIRSTUDIO handles personal data and online bookings. Read our privacy policy and learn about your rights."],
  },
  "/imprint": {
    de: ["Impressum | 1200 HAIRSTUDIO", "Geschäfts- und Kontaktinformationen von 1200 HAIRSTUDIO an der Schulstrasse 2 in 8599 Salmsach, Schweiz."],
    en: ["Imprint | 1200 HAIRSTUDIO", "Business and contact information for 1200 HAIRSTUDIO at Schulstrasse 2, 8599 Salmsach, Switzerland."],
  },
};
export function languageAlternates(origin: string, path: string) {
  return { "de-CH": origin + localizedPath(path, "de"), en: origin + localizedPath(path, "en"), "x-default": origin + localizedPath(path, "de") };
}
export function socialMetadata(origin: string, locale: Locale, title: string, description: string, path: string): Pick<Metadata, "openGraph" | "twitter"> {
  // The repository contains the approved logo, but no 1200×630 OG artwork.
  // Reuse the real brand asset rather than inventing a replacement design.
  const image = { url: `${origin}/brand/logo.png`, width: 1562, height: 1562, alt: "1200 HAIRSTUDIO — MORE THAN A HAIRCUT." };
  return {
    openGraph: { type: "website", title, description, siteName: "1200 HAIRSTUDIO", url: origin + path, locale: locale === "de" ? "de_CH" : "en_GB", alternateLocale: locale === "de" ? "en_GB" : "de_CH", images: [image] },
    twitter: { card: "summary", title, description, images: [image] },
  };
}
export function publicMetadata(origin: string, locale: Locale, path: string): Metadata {
  const route = path.replace(/^\/(de|en)(?=\/|$)/, "").replace(/\/$/, "") || "/";
  const entry = pages[route]?.[locale];
  const [title, description] = entry ?? pages["/"][locale];
  const canonicalPath = localizedPath(route, locale);
  return {
    metadataBase: new URL(origin), title, description,
    robots: { index: Boolean(entry), follow: Boolean(entry) },
    alternates: entry ? { canonical: origin + canonicalPath, languages: languageAlternates(origin, route) } : undefined,
    ...socialMetadata(origin, locale, title, description, entry ? canonicalPath : `/${locale}`),
  };
}
