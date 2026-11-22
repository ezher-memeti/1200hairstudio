import "server-only";

export type SiteMode = "live" | "coming_soon" | "under_construction";
export function parseSiteMode(value: string | undefined): SiteMode {
  if (value === undefined) return "live";
  if (value === "live" || value === "coming_soon" || value === "under_construction") return value;
  throw new Error("APP_SITE_MODE must be live, coming_soon or under_construction.");
}
export function getSiteMode(): SiteMode { return parseSiteMode(process.env.APP_SITE_MODE); }
export function isEssentialSitePath(path: string): boolean {
  return /^\/(?:admin|account|dashboard|login|register|forgot-password|reset-password|auth|api)(?:\/|$)/.test(path)
    || /^\/(?:booking\/manage|unsubscribe)\/[^/]+\/?$/.test(path);
}
export function siteModeDestination(mode: SiteMode, path: string): string | null {
  if (mode === "live" || isEssentialSitePath(path)) return null;
  return mode === "coming_soon" ? "/coming-soon" : "/under-construction";
}
