import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import type { ServiceRecord } from "@/lib/services/types";

const weekdayLong = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

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

const ZURICH_TIME_ZONE = "Europe/Zurich";

export type EffectiveHours = {
  date: string;
  day_of_week: number;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  reason: string | null;
  source: "exception" | "business_hours" | "unavailable";
};

export type BookingDateOption = {
  id: string;
  day: string;
  date: string;
  month: string;
  fullDate: string;
  effectiveHours: EffectiveHours;
  isAvailable: boolean;
};

export type TimeGroup = {
  label: string;
  slots: string[];
};

export type ZurichDateTimeInfo = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hours: number;
  minutes: number;
  dateKey: string;
  date: Date;
};

export type NextAvailabilityPreview = {
  dateKey: string;
  label: "TODAY" | "TOMORROW" | string;
  weekday: string;
  dayNumber: string;
  month: string;
  year: string;
  fullDateLabel: string;
  status: string;
  slots: string[];
  effectiveHours: EffectiveHours;
};

function getZurichParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZURICH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekdayToken = get("weekday").toLowerCase();
  const weekdayMap: Record<string, number> = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 7,
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hours: Number(get("hour")),
    minutes: Number(get("minute")),
    weekday: weekdayMap[weekdayToken] ?? 1,
  };
}

export function getCurrentZurichDateTime(date = new Date()): ZurichDateTimeInfo {
  const parts = getZurichParts(date);
  const zonedDate = createDateAtNoon(parts.year, parts.month - 1, parts.day);

  return {
    ...parts,
    dateKey: toDateKey(zonedDate),
    date: zonedDate,
  };
}

export function createDateAtNoon(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return createDateAtNoon(year, month - 1, day);
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);

  if (!date) {
    throw new Error("Invalid Zurich date key.");
  }

  const nextDate = createDateAtNoon(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
  );

  return toDateKey(nextDate);
}

export function getWeekdayNumber(date: Date) {
  const weekday = date.getDay();
  return weekday === 0 ? 7 : weekday;
}

export function getEffectiveHours(
  date: Date,
  businessHours: BusinessHourRecord[],
  exceptionsByDate: Map<string, AvailabilityExceptionRecord>,
): EffectiveHours {
  const dateKey = toDateKey(date);
  const weekday = getWeekdayNumber(date);
  const exception = exceptionsByDate.get(dateKey);

  if (exception) {
    return {
      date: dateKey,
      day_of_week: weekday,
      is_closed: exception.is_closed,
      open_time: exception.is_closed ? null : exception.open_time,
      close_time: exception.is_closed ? null : exception.close_time,
      reason: exception.reason,
      source: "exception",
    };
  }

  const weeklyHours =
    businessHours.find((hour) => hour.day_of_week === weekday) ?? null;

  if (!weeklyHours) {
    return {
      date: dateKey,
      day_of_week: weekday,
      is_closed: true,
      open_time: null,
      close_time: null,
      reason: null,
      source: "unavailable",
    };
  }

  return {
    date: dateKey,
    day_of_week: weekday,
    is_closed: weeklyHours.is_closed,
    open_time: weeklyHours.is_closed ? null : weeklyHours.open_time,
    close_time: weeklyHours.is_closed ? null : weeklyHours.close_time,
    reason: null,
    source: "business_hours",
  };
}

export function createBookingDateOption(date: Date): BookingDateOption {
  const weekday = getWeekdayNumber(date);
  const day = date.getDate();
  const monthIndex = date.getMonth();

  return {
    id: toDateKey(date),
    day: weekdayShortUpper[weekday - 1],
    date: String(day).padStart(2, "0"),
    month: monthShortUpper[monthIndex],
    fullDate: `${weekdayLong[weekday - 1].toUpperCase()}, ${String(day).padStart(2, "0")} ${monthLong[monthIndex].toUpperCase()} ${date.getFullYear()}`,
    effectiveHours: {
      date: toDateKey(date),
      day_of_week: weekday,
      is_closed: false,
      open_time: null,
      close_time: null,
      reason: null,
      source: "unavailable",
    },
    isAvailable: false,
  };
}

export function generateUpcomingDateOptions(
  startDateKey: string,
  options?: {
    count?: number;
    horizonDays?: number;
  },
) {
  const startDate = parseDateKey(startDateKey) ?? getCurrentZurichDateTime().date;
  const count = options?.count ?? 10;
  const horizonDays = options?.horizonDays ?? 30;
  const dates: BookingDateOption[] = [];

  for (let offset = 0; offset < horizonDays && dates.length < count; offset += 1) {
    const nextDate = createDateAtNoon(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + offset,
    );
    dates.push(createBookingDateOption(nextDate));
  }

  return dates;
}

export function getServiceBookingDuration(service: Pick<ServiceRecord, "duration_min">) {
  return service.duration_min;
}

export function groupTimeSlots(slots: string[]) {
  const labels = [
    { label: "Morning", min: 0, max: 12 * 60 },
    { label: "Afternoon", min: 12 * 60, max: 17 * 60 },
    { label: "Evening", min: 17 * 60, max: 24 * 60 },
  ];

  return labels
    .map((label) => ({
      label: label.label,
      slots: slots.filter((slot) => {
        const [hoursPart, minutesPart] = slot.split(":").map(Number);
        const total = hoursPart * 60 + minutesPart;
        return total >= label.min && total < label.max;
      }),
    }))
    .filter((group) => group.slots.length > 0) as TimeGroup[];
}
