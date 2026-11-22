export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";
export const localeCookie = "1200_locale";
export function isLocale(value: unknown): value is Locale { return value === "de" || value === "en"; }
export function resolveLocale(value: unknown): Locale { return isLocale(value) ? value : defaultLocale; }
export function isNonLocalizedPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return /^\/(?:api|auth|_next|_vercel|images|frames|fonts|videos|icons)(?:\/|$)/.test(pathname)
    || /^\/(?:favicon\.ico|sitemap\.xml|robots\.txt|manifest\.webmanifest)$/.test(pathname);
}
export function localizedPath(path: string, locale: Locale): string {
  if (!path.startsWith("/") || path.startsWith("//") || isNonLocalizedPath(path)) return path;
  const suffix = path.replace(/^\/(de|en)(?=\/|$|[?#])/, "");
  return `/${locale}${suffix === "/" ? "" : suffix}`;
}
export function notificationLocale(preference: unknown, bookingLocale: unknown): Locale {
  return isLocale(preference) ? preference : resolveLocale(bookingLocale);
}
export function translatedField<T extends object>(row: T, field: keyof T, locale: string): string {
  const source = row as Record<string, unknown>;
  const translated = source[`${String(field)}_de`];
  return locale === "de" && typeof translated === "string" && translated.trim() ? translated : String(source[String(field)] ?? "");
}
export const intlLocale = (locale: string) => locale === "de" ? "de-CH" : "en-GB";
export function formatDateForLocale(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", day: "2-digit", month: "long", year: "numeric", weekday: "long" }).format(new Date(value));
}
