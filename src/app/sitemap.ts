import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/auth/url";
import { locales, localizedPath } from "@/i18n/config";
import { indexablePaths, languageAlternates } from "@/lib/seo/metadata";
import { getSiteMode } from "@/lib/site-mode";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  if (getSiteMode() !== "live") return [];
  const origin = getSiteUrl();
  return indexablePaths.flatMap(path => locales.map(locale => ({ url: `${origin}${localizedPath(path, locale)}`, alternates: { languages: languageAlternates(origin, path) } })));
}
