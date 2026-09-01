import type { CustomerRecord } from "./types";

export type MarketingConsentCustomer = Pick<
  CustomerRecord,
  | "email"
  | "marketing_email_consent"
  | "marketing_email_consented_at"
  | "marketing_email_consent_source"
  | "marketing_email_unsubscribed_at"
>;

export function isValidEmail(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim() ?? "");
}

export function canReceiveMarketingEmail(customer: MarketingConsentCustomer) {
  return Boolean(
    isValidEmail(customer.email) &&
      customer.marketing_email_consent &&
      !customer.marketing_email_unsubscribed_at,
  );
}

export function getMarketingConsentStatus(customer: MarketingConsentCustomer) {
  if (customer.marketing_email_unsubscribed_at) return "unsubscribed" as const;
  if (canReceiveMarketingEmail(customer)) return "subscribed" as const;
  return "not_subscribed" as const;
}

export function shouldRecordSignupMarketingConsent(
  customer: MarketingConsentCustomer,
  requestedConsent: boolean,
) {
  return Boolean(
    requestedConsent &&
      (!customer.marketing_email_consent || customer.marketing_email_unsubscribed_at),
  );
}
