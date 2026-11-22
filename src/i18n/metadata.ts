import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { textFor } from "./text";
import { getSiteUrl } from "@/lib/auth/url";
import { localizedPath, resolveLocale } from "./config";
export async function localizedMetadata(): Promise<Metadata> {
  const locale = resolveLocale(await getLocale());
  const path = (await headers()).get("x-app-pathname") ?? `/${locale}`;
  const privatePage = /^\/(de|en)\/(?:admin|account|dashboard|booking\/manage|unsubscribe|reset-password|login|register|forgot-password)(?:\/|$)/.test(path);
  const brandTitle = locale === "de" ? "1200 Hairstudio | Herrenfriseur in Salmsach" : "1200 Hairstudio | Barbershop in Salmsach";
  const route = path.replace(/^\/(de|en)/, "") || "/";
  const pageLabels: Record<string,string> = { "/book": "Book a Session", "/privacy": "Privacy Policy", "/imprint": "Imprint", "/login": "Customer Login", "/register": "Create Your Account", "/forgot-password": "Forgot Password", "/reset-password": "Reset Your Password", "/account": "My Account", "/dashboard": "My Account", "/admin": "Dashboard", "/admin/login": "Admin Login" };
  const title = pageLabels[route] ? `${textFor(locale, pageLabels[route])} | 1200 Hairstudio` : brandTitle;
  const description = locale === "de" ? "Präzise Haarschnitte, saubere Übergänge und individuelle Beratung bei 1200 Hairstudio in Salmsach. Buche deinen Termin online." : "Precise haircuts, clean fades and personal advice at 1200 Hairstudio in Salmsach. Book your appointment online.";
  const origin = getSiteUrl();
  return { title, description, metadataBase: new URL(origin), robots: privatePage ? { index: false, follow: false } : { index: true, follow: true },
    alternates: privatePage ? undefined : { canonical: `${origin}${path}`, languages: { "de-CH": `${origin}${localizedPath(path, "de")}`, en: `${origin}${localizedPath(path, "en")}`, "x-default": `${origin}${localizedPath(path,"de")}` } },
    openGraph: { title, description, url: privatePage ? `${origin}/${locale}` : `${origin}${path}`, locale: locale === "de" ? "de_CH" : "en_GB", alternateLocale: locale === "de" ? "en_GB" : "de_CH", siteName: "1200 Hairstudio" },
  };
}
