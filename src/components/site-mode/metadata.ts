import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo/metadata";
import { resolveLocale } from "@/i18n/config";
import { getLocale, getTranslations } from "next-intl/server";
import { getSiteUrl } from "@/lib/auth/url";
export async function siteModeMetadata(kind: "coming" | "maintenance"): Promise<Metadata> {
  const t = await getTranslations("siteMode");
  const locale = await getLocale();
  const path = kind === "coming" ? "coming-soon" : "under-construction";
  const origin = getSiteUrl();
  const title = kind === "coming" ? t("coming.metaTitle") : t("maintenance.metaTitle");
  const description = kind === "coming" ? t("coming.metaDescription") : t("maintenance.metaDescription");
  return { title, description, robots: { index: false, follow: false }, alternates: { canonical: `${origin}/${locale}/${path}`, languages: { "de-CH": `${origin}/de/${path}`, en: `${origin}/en/${path}`, "x-default": `${origin}/de/${path}` } }, ...socialMetadata(origin, resolveLocale(locale), title, description, `/${locale}/${path}`) };
}
