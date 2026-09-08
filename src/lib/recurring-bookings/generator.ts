import type { RecurringFrequency } from "@/lib/recurring-bookings/types";
import { addDaysToDateKey, getWeekdayNumber, parseDateKey, toDateKey } from "@/lib/public/booking-availability-utils";

export function generateRecurringDates(input: { startsOn: string; endsOn: string; frequency: RecurringFrequency; weekday: number; fromDate?: string | null }) {
  const start = parseDateKey(input.startsOn);
  if (!start || input.weekday < 1 || input.weekday > 7) throw new Error("Invalid recurring booking dates.");
  const intervalDays = input.frequency === "biweekly" ? 14 : 7;
  const offset = (input.weekday - getWeekdayNumber(start) + 7) % 7;
  let dateKey = addDaysToDateKey(input.startsOn, offset);
  const dates: string[] = [];
  while (dateKey <= input.endsOn) {
    if (!input.fromDate || dateKey >= input.fromDate) dates.push(dateKey);
    dateKey = addDaysToDateKey(dateKey, intervalDays);
  }
  return dates;
}

export function weekdayForDateKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  if (!date) throw new Error("Invalid date.");
  return getWeekdayNumber(date);
}

export function normalizeDateKey(value: string) {
  const date = parseDateKey(value);
  if (!date) throw new Error("Invalid date.");
  return toDateKey(date);
}
