import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/auth/url";
import { locales, localizedPath } from "@/i18n/config";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteUrl();
  return ["/", "/book", "/privacy", "/imprint"].flatMap(path => locales.map(locale => ({ url: `${origin}${localizedPath(path, locale)}`, alternates: { languages: Object.fromEntries(locales.map(l => [l === "de" ? "de-CH" : "en", `${origin}${localizedPath(path, l)}`])) } })));
}
