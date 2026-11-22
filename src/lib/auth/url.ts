import { localizedPath, resolveLocale } from "@/i18n/config";
export function getSiteUrl() {
  const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (publicSiteUrl) {
    return publicSiteUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function getResetPasswordRedirectUrl(locale: string = "de") {
  return `${getSiteUrl()}${localizedPath("/reset-password", resolveLocale(locale))}`;
}
