export const ZURICH_TIME_ZONE = "Europe/Zurich";

export function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseDateKeyToUtcDate(dateKey: string) {
  if (!isValidDateKey(dateKey)) {
    return null;
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

export function formatDateKey(dateKey: string, options: Intl.DateTimeFormatOptions) {
  const date = parseDateKeyToUtcDate(dateKey);

  if (!date) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH_TIME_ZONE,
    ...options,
  }).format(date);
}

export function getTodayDateKeyInZurich(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZURICH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function getZurichDateKeyFromIso(isoString: string) {
  return getTodayDateKeyInZurich(new Date(isoString));
}

export function addMonthsToDateKey(dateKey: string, months: number) {
  const date = parseDateKeyToUtcDate(dateKey);

  if (!date) {
    throw new Error("Invalid date key.");
  }

  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function getMonthStartDateKey(dateKey: string) {
  const date = parseDateKeyToUtcDate(dateKey);

  if (!date) {
    throw new Error("Invalid date key.");
  }

  date.setUTCDate(1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function getWeekdayNumberFromDateKey(dateKey: string) {
  const date = parseDateKeyToUtcDate(dateKey);

  if (!date) {
    throw new Error("Invalid date key.");
  }

  const weekday = date.getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function getMonthGridDateKeys(dateKey: string) {
  const monthStart = parseDateKeyToUtcDate(getMonthStartDateKey(dateKey));

  if (!monthStart) {
    throw new Error("Invalid date key.");
  }

  const weekday = monthStart.getUTCDay() === 0 ? 7 : monthStart.getUTCDay();
  monthStart.setUTCDate(monthStart.getUTCDate() - (weekday - 1));

  return Array.from({ length: 42 }, (_, index) => {
    const next = new Date(monthStart);
    next.setUTCDate(monthStart.getUTCDate() + index);
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
      next.getUTCDate(),
    ).padStart(2, "0")}`;
  });
}
