import { textFor } from "./text";
import { intlLocale } from "./config";
export function weekdayLabel(dayOfWeek: number, locale: string, width: "long" | "short" | "narrow" = "long") {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: width, timeZone: "Europe/Zurich" }).format(new Date(Date.UTC(2026, 0, 5 + dayOfWeek - 1, 12)));
}
export function weekdayLabels(locale: string, width: "long" | "short" | "narrow" = "long") {
  return Array.from({ length: 7 }, (_, index) => weekdayLabel(index + 1, locale, width));
}
export function monthLabel(month: number, locale: string, width: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: width, timeZone: "Europe/Zurich" }).format(new Date(Date.UTC(2026, month, 1, 12)));
}

export function reportRowLabel(key: string, fallback: string, locale: string) {
  if (key.toLowerCase() === "total") return textFor(locale, "TOTAL");
  const monthly = /^\d{4}-\d{2}$/.test(key);
  if (!monthly && !/^\d{4}-\d{2}-\d{2}$/.test(key)) return fallback;
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", ...(monthly ? { month: "long", year: "numeric" } : { day: "2-digit", month: "short", year: "numeric" }) } as Intl.DateTimeFormatOptions).format(new Date(`${key}${monthly ? "-15" : ""}T12:00:00Z`));
}
