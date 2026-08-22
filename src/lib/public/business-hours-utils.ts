import type { BusinessHourRecord } from "@/lib/business-hours/types";

type BusinessHourFields = Pick<
  BusinessHourRecord,
  "day_of_week" | "is_closed" | "open_time" | "close_time"
>;

const weekdayLong = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const weekdayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const weekdayShortUpper = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const monthShortUpper = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const monthLong = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function formatBusinessHourTime(time: string | null) {
  return time ? time.slice(0, 5) : null;
}

export function formatBusinessHourRange(hour: Pick<BusinessHourFields, "is_closed" | "open_time" | "close_time">) {
  if (hour.is_closed) {
    return "CLOSED";
  }

  const open = formatBusinessHourTime(hour.open_time);
  const close = formatBusinessHourTime(hour.close_time);

  if (!open || !close) {
    return "HOURS UNAVAILABLE";
  }

  return `${open}–${close}`;
}

export function getBusinessHourDayLabel(dayOfWeek: number) {
  return weekdayShort[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
}

export function getBusinessHourDayLabelUpper(dayOfWeek: number) {
  return weekdayShortUpper[dayOfWeek - 1] ?? `DAY ${dayOfWeek}`;
}

export type BookingDate = {
  id: string;
  day: string;
  date: string;
  month: string;
  fullDate: string;
  businessHour: BusinessHourFields;
};

export function buildBookingDates(hours: BusinessHourRecord[], count = 6) {
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
      day: getBusinessHourDayLabelUpper(dayOfWeek),
      date: String(day).padStart(2, "0"),
      month: monthShortUpper[month],
      fullDate: `${weekdayLong[dayOfWeek - 1].toUpperCase()}, ${String(day).padStart(2, "0")} ${monthLong[month].toUpperCase()} ${year}`,
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
