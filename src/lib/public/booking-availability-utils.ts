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

export function getWeekdayNumber(date: Date) {
  const weekday = date.getDay();
  return weekday === 0 ? 7 : weekday;
}

export function formatBusinessHourTime(time: string | null) {
  return time ? time.slice(0, 5) : null;
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

export function generateUpcomingBookingDates(
  businessHours: BusinessHourRecord[],
  exceptions: AvailabilityExceptionRecord[],
  options?: {
    startDate?: Date;
    count?: number;
    horizonDays?: number;
  },
) {
  const exceptionsByDate = new Map(
    exceptions.map((exception) => [exception.date, exception]),
  );
  const dates: BookingDateOption[] = [];
  const startDate = options?.startDate ?? getCurrentZurichDateTime().date;
  const count = options?.count ?? 10;
  const horizonDays = options?.horizonDays ?? 30;

  for (let offset = 0; offset < horizonDays && dates.length < count; offset += 1) {
    const nextDate = createDateAtNoon(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + offset,
    );
    const weekday = getWeekdayNumber(nextDate);
    const effectiveHours = getEffectiveHours(
      nextDate,
      businessHours,
      exceptionsByDate,
    );
    const isAvailable =
      !effectiveHours.is_closed &&
      Boolean(effectiveHours.open_time) &&
      Boolean(effectiveHours.close_time);
    const day = nextDate.getDate();
    const monthIndex = nextDate.getMonth();

    dates.push({
      id: toDateKey(nextDate),
      day: weekdayShortUpper[weekday - 1],
      date: String(day).padStart(2, "0"),
      month: monthShortUpper[monthIndex],
      fullDate: `${weekdayLong[weekday - 1].toUpperCase()}, ${String(day).padStart(2, "0")} ${monthLong[monthIndex].toUpperCase()} ${nextDate.getFullYear()}`,
      effectiveHours,
      isAvailable,
    });
  }

  return dates;
}

export function getServiceBookingDuration(service: Pick<ServiceRecord, "duration_min">) {
  return service.duration_min;
}

export function generateSlots(
  openTime: string | null,
  closeTime: string | null,
  serviceDuration: number,
) {
  if (!openTime || !closeTime || serviceDuration <= 0) {
    return [] as string[];
  }

  const [openHour, openMinute] = openTime.split(":").map(Number);
  const [closeHour, closeMinute] = closeTime.split(":").map(Number);
  const openTotal = openHour * 60 + openMinute;
  const closeTotal = closeHour * 60 + closeMinute;

  if (closeTotal <= openTotal) {
    return [] as string[];
  }

  const step = Math.min(serviceDuration, 30);
  const slots: string[] = [];

  for (let minutes = openTotal; minutes + serviceDuration <= closeTotal; minutes += step) {
    const hourPart = Math.floor(minutes / 60);
    const minutePart = minutes % 60;
    slots.push(`${String(hourPart).padStart(2, "0")}:${String(minutePart).padStart(2, "0")}`);
  }

  return slots;
}

export function filterPastSlots(
  slots: string[],
  dateKey: string,
  currentZurich: ZurichDateTimeInfo,
) {
  if (dateKey !== currentZurich.dateKey) {
    return slots;
  }

  const currentMinutes = currentZurich.hours * 60 + currentZurich.minutes;

  return slots.filter((slot) => {
    const [hoursPart, minutesPart] = slot.split(":").map(Number);
    return hoursPart * 60 + minutesPart > currentMinutes;
  });
}

export function findNextAvailableDate(
  businessHours: BusinessHourRecord[],
  exceptions: AvailabilityExceptionRecord[],
  serviceDuration: number,
  options?: {
    startDate?: Date;
    horizonDays?: number;
    currentDateTime?: ZurichDateTimeInfo;
  },
) {
  const exceptionsByDate = new Map(
    exceptions.map((exception) => [exception.date, exception]),
  );
  const currentZurich = options?.currentDateTime ?? getCurrentZurichDateTime();
  const startDate = options?.startDate ?? currentZurich.date;
  const horizonDays = options?.horizonDays ?? 30;

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const nextDate = createDateAtNoon(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + offset,
    );
    const effectiveHours = getEffectiveHours(nextDate, businessHours, exceptionsByDate);

    if (effectiveHours.is_closed || !effectiveHours.open_time || !effectiveHours.close_time) {
      continue;
    }

    const rawSlots = generateSlots(
      effectiveHours.open_time,
      effectiveHours.close_time,
      serviceDuration,
    );
    const availableSlots = filterPastSlots(rawSlots, effectiveHours.date, currentZurich);

    if (availableSlots.length > 0) {
      return {
        date: nextDate,
        effectiveHours,
        slots: availableSlots,
      };
    }
  }

  return null;
}

export function getAvailabilityStatus(
  effectiveHours: EffectiveHours,
  currentZurich: ZurichDateTimeInfo,
  referenceDateKey: string,
) {
  const closeTime = formatBusinessHourTime(effectiveHours.close_time);
  const openTime = formatBusinessHourTime(effectiveHours.open_time);

  if (effectiveHours.date === currentZurich.dateKey) {
    if (effectiveHours.is_closed || !closeTime) {
      return "CLOSED TODAY";
    }

    return `OPEN TODAY · UNTIL ${closeTime}`;
  }

  if (referenceDateKey !== currentZurich.dateKey && effectiveHours.date !== currentZurich.dateKey) {
    const tomorrowDate = createDateAtNoon(
      currentZurich.date.getFullYear(),
      currentZurich.date.getMonth(),
      currentZurich.date.getDate() + 1,
    );

    if (effectiveHours.date === toDateKey(tomorrowDate) && openTime) {
      return `OPENS TOMORROW · ${openTime}`;
    }
  }

  return closeTime ? `OPEN · UNTIL ${closeTime}` : "NO AVAILABILITY";
}

export function getRelativeDateLabel(
  targetDate: Date,
  currentZurich: ZurichDateTimeInfo,
) {
  const differenceInDays = Math.round(
    (createDateAtNoon(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    ).getTime() - currentZurich.date.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  if (differenceInDays === 0) {
    return "TODAY";
  }

  if (differenceInDays === 1) {
    return "TOMORROW";
  }

  return weekdayLong[getWeekdayNumber(targetDate) - 1].toUpperCase();
}

export function buildNextAvailabilityPreview(
  businessHours: BusinessHourRecord[],
  exceptions: AvailabilityExceptionRecord[],
  services: Pick<ServiceRecord, "duration_min" | "is_active">[],
  options?: {
    currentDateTime?: ZurichDateTimeInfo;
    horizonDays?: number;
    visibleSlotsCount?: number;
  },
): NextAvailabilityPreview | null {
  const activeServices = services.filter((service) => service.is_active);
  const previewService = activeServices[0] ?? null;

  if (!previewService) {
    return null;
  }

  const currentZurich = options?.currentDateTime ?? getCurrentZurichDateTime();
  const nextAvailable = findNextAvailableDate(
    businessHours,
    exceptions,
    getServiceBookingDuration(previewService),
    {
      startDate: currentZurich.date,
      horizonDays: options?.horizonDays ?? 30,
      currentDateTime: currentZurich,
    },
  );

  if (!nextAvailable) {
    return null;
  }

  const visibleSlots = nextAvailable.slots.slice(0, options?.visibleSlotsCount ?? 3);
  const weekday = getWeekdayNumber(nextAvailable.date);
  const dayNumber = String(nextAvailable.date.getDate()).padStart(2, "0");
  const monthIndex = nextAvailable.date.getMonth();

  return {
    dateKey: nextAvailable.effectiveHours.date,
    label: getRelativeDateLabel(nextAvailable.date, currentZurich),
    weekday: weekdayLong[weekday - 1].toUpperCase(),
    dayNumber,
    month: monthLong[monthIndex].toUpperCase(),
    year: String(nextAvailable.date.getFullYear()),
    fullDateLabel: `${weekdayLong[weekday - 1].toUpperCase()}, ${dayNumber} ${monthLong[monthIndex].toUpperCase()} ${nextAvailable.date.getFullYear()}`,
    status: getAvailabilityStatus(
      nextAvailable.effectiveHours,
      currentZurich,
      nextAvailable.effectiveHours.date,
    ),
    slots: visibleSlots,
    effectiveHours: nextAvailable.effectiveHours,
  };
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
