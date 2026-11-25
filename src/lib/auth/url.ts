import { localizedPath, resolveLocale } from "@/i18n/config";

export const PRODUCTION_SITE_URL = "https://1200hairstudio.ch";

function originOf(value: string | undefined, httpsOnly = false) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || (httpsOnly && url.protocol !== "https:") ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function isLoopback(hostname: string) {
  hostname = hostname.replace(/\.$/, "");
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" ||
    hostname === "0.0.0.0" || /^127\./.test(hostname);
}

export function getSiteUrl() {
  // Public Vercel variables are build-inlined for browser/server parity.
  const environment = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV;
  const configured = originOf(process.env.NEXT_PUBLIC_SITE_URL);
  const browserOrigin = typeof window !== "undefined" ? originOf(window.location.origin) : null;
  if (environment === "preview") {
    const deployment = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
    const branch = process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL ?? process.env.VERCEL_BRANCH_URL;
    const candidates = [configured, originOf(deployment ? `https://${deployment}` : undefined, true), originOf(branch ? `https://${branch}` : undefined, true)]
      .filter((value): value is string => Boolean(value && value.startsWith("https://") &&
        !isLoopback(new URL(value).hostname) && !["1200hairstudio.ch", "www.1200hairstudio.ch"].includes(new URL(value).hostname)));
    return browserOrigin && candidates.includes(browserOrigin) ? browserOrigin : candidates[0] ?? PRODUCTION_SITE_URL;
  }
  if (environment === "production" || (process.env.NODE_ENV === "production" && environment !== "development")) {
    return PRODUCTION_SITE_URL;
  }
  // Browser auth must return to the initiating origin to retain PKCE verifier cookies.
  return browserOrigin ?? configured ?? "http://localhost:3000";
}

/** Normalize studio/legacy local URLs while preserving intentional external HTTP(S) links. */
export function localizePublicUrl(value: string, locale: string) {
  const input = value.trim();
  if (!input || input.startsWith("//") || input.includes("\\")) throw new Error("Invalid public link.");
  const base = new URL(getSiteUrl());
  const url = new URL(input, base);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid public link.");
  const internal = url.origin === base.origin || isLoopback(url.hostname) ||
    ["1200hairstudio.ch", "www.1200hairstudio.ch"].includes(url.hostname);
  if (!internal) return input;
  url.protocol = base.protocol;
  url.host = base.host;
  url.port = base.port;
  url.pathname = localizedPath(url.pathname, resolveLocale(locale));
  return url.href;
}

export function getLocalizedSiteUrl(path: string, locale: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("Invalid site path.");
  return new URL(localizedPath(path, resolveLocale(locale)), getSiteUrl()).href;
}

export function getResetPasswordRedirectUrl(locale: string = "de") {
  return getLocalizedSiteUrl("/reset-password", locale);
}
