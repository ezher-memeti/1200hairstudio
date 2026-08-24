import { createClient } from "@/lib/supabase/server";
import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";

export { addDaysToDateKey, buildNextAvailabilityPreview, filterPastSlots, findNextAvailableDate, generateSlots, generateUpcomingBookingDates, getCurrentZurichDateTime, getEffectiveHours, getServiceBookingDuration, groupTimeSlots, hydrateZurichDateTime, serializeZurichDateTime } from "@/lib/public/booking-availability-utils";

export async function getAvailabilityExceptions(dateFrom?: string, dateTo?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("availability_exceptions")
    .select("*")
    .order("date", { ascending: true });

  if (dateFrom) {
    query = query.gte("date", dateFrom);
  }

  if (dateTo) {
    query = query.lte("date", dateTo);
  }

  const { data, error } = await query;

  if (error) {
    return [] as AvailabilityExceptionRecord[];
  }

  return (data ?? []) as AvailabilityExceptionRecord[];
}
