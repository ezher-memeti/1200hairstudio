// Confirmed fallback identity; persisted business settings override this single source.
export const DEFAULT_BUSINESS_SETTINGS = {
  businessName: "1200 Hairstudio", ownerName: "Arban Shaqiri", uid: "",
  addressLine: "Schulstrasse 2", postalCode: "8599", city: "Salmsach", region: "Thurgau",
  country: "Switzerland", email: "1200hairstudio@gmail.com", phone: "+41 79 912 72 30",
  website: "", timezone: "Europe/Zurich", currency: "CHF" as const,
};
export function cleanBusinessText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() && !/\[\s*placeholder\s*\]/i.test(value) ? value.trim() : fallback;
}
export function businessCountry(country: string, locale: string) {
  return /^(switzerland|schweiz|ch)$/i.test(country.trim()) ? locale === "de" ? "Schweiz" : "Switzerland" : country;
}
export function businessPhoneHref(phone: string) {
  const number = phone.replace(/[\s().-]/g, "");
  return /^\+?\d{6,15}$/.test(number) ? `tel:${number}` : "";
}
export function businessEmailHref(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : "";
}
export function businessAddress(business: typeof DEFAULT_BUSINESS_SETTINGS, locale = "en") {
  return [business.addressLine, `${business.postalCode} ${business.city}`.trim(), businessCountry(business.country, locale)].filter(Boolean);
}
