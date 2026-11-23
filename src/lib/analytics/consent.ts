export const PRIVACY_SETTINGS_EVENT = "1200:privacy-preferences";
export const CONSENT_KEY = "1200_cookie_consent_v1";
export const COMPLETIONS_KEY = "1200_ga4_completions_v1";
export const FLOW_KEY = "1200_ga4_flow_v1";
export const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;
export const CONSENT_POLICY_VERSION = "analytics-v1";
export type ConsentDecision = {
  version: 1;
  status: "accepted" | "rejected";
  analytics: boolean;
  decidedAt: number;
  policyVersion: typeof CONSENT_POLICY_VERSION;
  expires: number;
};
export function readConsent(storage: Pick<Storage, "getItem">, now = Date.now()): ConsentDecision | null {
  try {
    const value = JSON.parse(storage.getItem(CONSENT_KEY) ?? "null");
    if (value?.version !== 1 || typeof value.analytics !== "boolean" || !Number.isFinite(value.expires) || value.expires <= now || value.expires > now + CONSENT_LIFETIME + 60000) return null;
    const status = value.analytics ? "accepted" : "rejected";
    // Old v1 records already express the same policy. Normalize in memory only:
    // retain their original expiry; do not silently renew consent or rewrite it.
    if (value.status === undefined && value.decidedAt === undefined && value.policyVersion === undefined) {
      if (String(CONSENT_POLICY_VERSION) !== "analytics-v1") return null;
      return { version: 1, status, analytics: value.analytics, decidedAt: value.expires - CONSENT_LIFETIME, policyVersion: CONSENT_POLICY_VERSION, expires: value.expires };
    }
    if (value.status !== status || value.policyVersion !== CONSENT_POLICY_VERSION || !Number.isFinite(value.decidedAt) || value.decidedAt > now + 60000 || value.decidedAt >= value.expires || value.expires - value.decidedAt > CONSENT_LIFETIME + 60000) return null;
    return { version: 1, status, analytics: value.analytics, decidedAt: value.decidedAt, policyVersion: CONSENT_POLICY_VERSION, expires: value.expires };
  } catch { return null; }
}
export function clearAnalyticsStorage(win: Window) {
  try { win.localStorage.removeItem(COMPLETIONS_KEY); win.sessionStorage.removeItem(FLOW_KEY); } catch { /* Optional storage may be blocked. */ }
  // Remove only Google Analytics cookies, at host and parent-domain scope.
  try {
    const names = win.document.cookie.split(";").map(part => part.split("=")[0].trim()).filter(name => /^_ga(?:_|$)/.test(name));
    const parts = win.location.hostname.split(".");
    for (const name of names) {
      win.document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      for (let index = 0; index < parts.length - 1; index++) win.document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${parts.slice(index).join(".")}; SameSite=Lax`;
    }
  } catch { /* Cookie access may be blocked; never touch essential cookies. */ }
}
