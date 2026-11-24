import {
  getTodayDateKeyInZurich,
} from "@/lib/appointments/date-utils";

export const CALENDAR_READ_ONLY_ERROR = "Past calendar dates are read-only.";
export const CALENDAR_INVALID_DATE_ERROR = "Choose a valid calendar date.";
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function isPastCalendarDate(date: string, now = new Date()) {
  return isCalendarDate(date) && date < getTodayDateKeyInZurich(now);
}
export function assertEditableCalendarDates(dates: string[], now = new Date()) {
  if (!dates.length || dates.some((date) => !isCalendarDate(date)))
    throw new Error(CALENDAR_INVALID_DATE_ERROR);
  if (dates.some((date) => isPastCalendarDate(date, now)))
    throw new Error(CALENDAR_READ_ONLY_ERROR);
}
export { getTodayDateKeyInZurich as calendarTodayInZurich };
