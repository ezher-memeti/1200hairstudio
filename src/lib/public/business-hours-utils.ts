import { weekdayLabel, monthLabel } from "@/i18n/format";
import { textFor } from "@/i18n/text";
import type { BusinessHourRecord } from "@/lib/business-hours/types";

type BusinessHourFields = Pick<
  BusinessHourRecord,
  "day_of_week" | "is_closed" | "open_time" | "close_time"
>;

export function formatBusinessHourTime(time: string | null) {
  return time ? time.slice(0, 5) : null;
}

export function formatBusinessHourRange(hour: Pick<BusinessHourFields, "is_closed" | "open_time" | "close_time">, locale = "en") {
  if (hour.is_closed) {
    return textFor(locale, "CLOSED");
  }

  const open = formatBusinessHourTime(hour.open_time);
  const close = formatBusinessHourTime(hour.close_time);

  if (!open || !close) {
    return textFor(locale, "HOURS UNAVAILABLE");
  }

  return `${open}–${close}`;
}

export function getBusinessHourDayLabel(dayOfWeek: number, locale = "en") {
  return weekdayLabel(dayOfWeek, locale, "short");
}

export function getBusinessHourDayLabelUpper(dayOfWeek: number, locale = "en") {
  return weekdayLabel(dayOfWeek, locale, "short").toLocaleUpperCase();
}

export function getOpenBusinessWeekdays(hours: BusinessHourFields[]) {
  return Array.from(new Set(
    hours
      .filter((hour) => !hour.is_closed && Boolean(hour.open_time) && Boolean(hour.close_time))
      .map((hour) => hour.day_of_week),
  )).sort((first, second) => first - second);
}

export type BookingDate = {
  id: string;
  day: string;
  date: string;
  month: string;
  fullDate: string;
  businessHour: BusinessHourFields;
};

export function buildBookingDates(hours: BusinessHourRecord[], count = 6, locale = "en") {
  const openHoursByWeekday = new Map(
    hours
      .filter((hour) => !hour.is_closed && hour.open_time && hour.close_time)
      .map((hour) => [hour.day_of_week, hour]),
  );

  const dates: BookingDate[] = [];
  const startDate = new Date("2026-08-21T12:00:00");

  for (let offset = 0; offset < 21 && dates.length < count; offset += 1) {
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + offset);
    const jsDay = nextDate.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const businessHour = openHoursByWeekday.get(dayOfWeek);

    if (!businessHour) {
      continue;
    }

    const year = nextDate.getFullYear();
    const month = nextDate.getMonth();
    const day = nextDate.getDate();

    dates.push({
      id: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day: getBusinessHourDayLabelUpper(dayOfWeek, locale),
      date: String(day).padStart(2, "0"),
      month: monthLabel(month, locale, "short").toLocaleUpperCase(),
      fullDate: `${weekdayLabel(dayOfWeek, locale).toLocaleUpperCase()}, ${String(day).padStart(2, "0")} ${monthLabel(month, locale).toLocaleUpperCase()} ${year}`,
      businessHour,
    });
  }

  return dates;
}

export function buildTimeGroups(hour: BusinessHourFields | null) {
  if (!hour || hour.is_closed || !hour.open_time || !hour.close_time) {
    return [];
  }

  const [openHour, openMinute] = hour.open_time.split(":").map(Number);
  const [closeHour, closeMinute] = hour.close_time.split(":").map(Number);
  const openTotal = openHour * 60 + openMinute;
  const closeTotal = closeHour * 60 + closeMinute;

  const labels = [
    { label: "Morning", min: 0, max: 12 * 60 },
    { label: "Afternoon", min: 12 * 60, max: 17 * 60 },
    { label: "Evening", min: 17 * 60, max: 24 * 60 },
  ];

  const slots: string[] = [];
  for (let minutes = openTotal; minutes <= closeTotal - 60; minutes += 90) {
    const hourPart = Math.floor(minutes / 60);
    const minutePart = minutes % 60;
    slots.push(`${String(hourPart).padStart(2, "0")}:${String(minutePart).padStart(2, "0")}`);
  }

  return labels
    .map((label) => ({
      label: label.label,
      slots: slots.filter((slot) => {
        const [hoursPart, minutesPart] = slot.split(":").map(Number);
        const total = hoursPart * 60 + minutesPart;
        return total >= label.min && total < label.max;
      }),
    }))
    .filter((group) => group.slots.length > 0);
}
