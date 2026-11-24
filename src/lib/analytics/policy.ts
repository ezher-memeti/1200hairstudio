export type AnalyticsSiteMode = "live" | "coming_soon" | "under_construction";
export type AnalyticsEvent = "booking_started" | "service_selected" | "booking_completed" | "booking_cta_clicked" | "contact_clicked" | "instagram_clicked" | "footer_developer_link_click";
export type ContactAction = "phone" | "maps" | "review" | "instagram";
export type AnalyticsConfig = { measurementId: string; production: boolean; origin: string; siteMode: AnalyticsSiteMode };
const pages: Record<string, string> = { "": "Home", "/book": "Booking", "/privacy": "Privacy", "/imprint": "Imprint", "/coming-soon": "Coming Soon", "/under-construction": "Under Construction" };
export function analyticsPage(href: string) {
  try {
    const url = new URL(href);
    const match = /^\/(de|en)(\/[^?#]*)?$/.exec(url.pathname.replace(/\/$/, ""));
    if (!match) return null;
    const route = match[2] ?? "";
    if (!(route in pages)) return null;
    if ([...url.searchParams.keys()].some(key => /token|code|password|secret|otp|auth|email|phone/i.test(key)) || /token|code=|password|secret|otp|auth/i.test(url.hash)) return null;
    return { path: `/${match[1]}${route}`, locale: match[1] as "de" | "en", title: `1200 HAIRSTUDIO | ${pages[route]}` };
  } catch { return null; }
}
export function analyticsEnabled(config: AnalyticsConfig, href: string) {
  try {
    const actual = new URL(href), expected = new URL(config.origin);
    return config.production && /^G-[A-Z0-9]{4,20}$/.test(config.measurementId) && expected.protocol === "https:" && actual.origin === expected.origin
      && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(actual.hostname) && Boolean(analyticsPage(href));
  } catch { return false; }
}
