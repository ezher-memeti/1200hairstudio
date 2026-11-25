import type { AdminNotification } from "./types";
function studioDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function notificationGroup(at: string, now = new Date()): "today" | "yesterday" | "earlier" {
  const today = studioDay(now), day = studioDay(new Date(at));
  const yesterday = new Date(`${today}T12:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return day === today ? "today" : day === studioDay(yesterday) ? "yesterday" : "earlier";
}
export function relativeNotificationTime(at: string, locale: string, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - Date.parse(at)) / 60000);
  const formatter = new Intl.RelativeTimeFormat(locale === "de" ? "de-CH" : "en-GB", { numeric: "auto" });
  return minutes < 60 ? formatter.format(-minutes, "minute") : minutes < 1440 ? formatter.format(-Math.floor(minutes / 60), "hour") : formatter.format(-Math.floor(minutes / 1440), "day");
}
export function appointmentNotificationTime(row: AdminNotification, locale: string) {
  return row.starts_at && Number.isFinite(Date.parse(row.starts_at)) ? new Intl.DateTimeFormat(locale === "de" ? "de-CH" : "en-GB", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(row.starts_at)) : null;
}
