import AdminAvailabilityCalendar from "@/components/admin/AdminAvailabilityCalendar";
import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import { getAdminAppointmentSummaries } from "@/lib/appointments/queries";
import { getAdminFinanceData } from "@/lib/finance/queries";
import { getActiveServices } from "@/lib/public/services";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCalendarPage() {
  const supabase = await createClient();
  const [{ data: hours, error: hoursError }, { data: exceptions, error: exceptionsError }, appointments, finance, services] =
    await Promise.all([
      supabase
        .from("business_hours")
        .select("*")
        .order("day_of_week", { ascending: true }),
      supabase
        .from("availability_exceptions")
        .select("*")
        .order("date", { ascending: true }),
      getAdminAppointmentSummaries(),
      getAdminFinanceData(),
      getActiveServices(),
    ]);


  const loadError = hoursError
    ? `Business hours query failed: ${hoursError.message}${hoursError.code ? ` [${hoursError.code}]` : ""}`
    : exceptionsError
      ? `Availability exceptions query failed: ${exceptionsError.message}${exceptionsError.code ? ` [${exceptionsError.code}]` : ""}`
      : null;

  return (
    <AdminAvailabilityCalendar
      initialBusinessHours={(hours ?? []) as BusinessHourRecord[]}
      initialExceptions={(exceptions ?? []) as AvailabilityExceptionRecord[]}
      appointments={appointments}
      transactions={finance.transactions}
      services={services}
      loadError={loadError}
    />
  );
}
