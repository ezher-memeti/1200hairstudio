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

export function getResetPasswordRedirectUrl() {
  return `${getSiteUrl()}/reset-password`;
}
