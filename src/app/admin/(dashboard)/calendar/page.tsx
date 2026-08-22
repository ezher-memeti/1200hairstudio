import AdminAvailabilityCalendar from "@/components/admin/AdminAvailabilityCalendar";
import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCalendarPage() {
  const supabase = await createClient();
  const [{ data: hours, error: hoursError }, { data: exceptions, error: exceptionsError }] =
    await Promise.all([
      supabase
        .from("business_hours")
        .select("*")
        .order("day_of_week", { ascending: true }),
      supabase
        .from("availability_exceptions")
        .select("*")
        .order("date", { ascending: true }),
    ]);

  if (hoursError) {
    console.error("[admin/calendar] business_hours.query.error", {
      code: hoursError.code,
      message: hoursError.message,
      details: hoursError.details,
      hint: hoursError.hint,
    });
  }

  if (exceptionsError) {
    console.error("[admin/calendar] availability_exceptions.query.error", {
      code: exceptionsError.code,
      message: exceptionsError.message,
      details: exceptionsError.details,
      hint: exceptionsError.hint,
    });
  }

  const loadError = hoursError
    ? `Business hours query failed: ${hoursError.message}${hoursError.code ? ` [${hoursError.code}]` : ""}`
    : exceptionsError
      ? `Availability exceptions query failed: ${exceptionsError.message}${exceptionsError.code ? ` [${exceptionsError.code}]` : ""}`
      : null;

  return (
    <AdminAvailabilityCalendar
      initialBusinessHours={(hours ?? []) as BusinessHourRecord[]}
      initialExceptions={(exceptions ?? []) as AvailabilityExceptionRecord[]}
      loadError={loadError}
    />
  );
}
