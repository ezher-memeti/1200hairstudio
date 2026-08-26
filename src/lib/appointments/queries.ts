import { createClient } from "@/lib/supabase/server";
import type { CustomerRecord } from "@/lib/customers/types";
import type { ServiceRecord } from "@/lib/services/types";
import {
  addMinutesToTime,
  formatZurichDate,
  formatZurichTimeRange,
  getUtcIsoForZurichDateTime,
} from "@/lib/appointments/availability";
import type {
  AdminAppointmentDetail,
  AdminAppointmentSummary,
  AppointmentRecord,
  CustomerAppointmentSummary,
} from "@/lib/appointments/types";
import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day + days, 12, 0, 0, 0);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(nextDate.getDate()).padStart(2, "0")}`;
}

function formatAppointmentSummary(
  appointment: AppointmentRecord,
  serviceName: string,
  currentTimestamp: number,
): CustomerAppointmentSummary {
  return {
    ...appointment,
    service_name: serviceName,
    date_label: formatZurichDate(appointment.start_at),
    time_label: formatZurichTimeRange(appointment.start_at, appointment.end_at),
    is_upcoming: new Date(appointment.end_at).getTime() >= currentTimestamp,
  };
}

export async function getAppointmentsForCustomer(customerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("customer_id", customerId)
    .order("start_at", { ascending: true });

  if (error) {
    return [] as AppointmentRecord[];
  }

  return (data ?? []) as AppointmentRecord[];
}

export async function getCustomerAppointmentSummaries(
  customer: CustomerRecord,
  services: ServiceRecord[],
  currentDateTime: { dateKey: string },
) {
  const appointments = await getAppointmentsForCustomer(customer.id);
  const servicesById = new Map(services.map((service) => [service.id, service]));
  const currentTimestamp = new Date(
    getUtcIsoForZurichDateTime(currentDateTime.dateKey, "00:00"),
  ).getTime();

  return appointments.map((appointment) =>
    formatAppointmentSummary(
      appointment,
      servicesById.get(appointment.service_id)?.name ?? "Service",
      currentTimestamp,
    ),
  );
}

export async function getAdminAppointmentSummaries() {
  const supabase = await createClient();
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*")
    .order("start_at", { ascending: true });

  if (error || !appointments?.length) {
    return [] as AdminAppointmentSummary[];
  }

  const appointmentRows = appointments as AppointmentRecord[];
  const customerIds = [
    ...new Set(
      appointmentRows
        .map((appointment) => appointment.customer_id)
        .filter((customerId): customerId is string => Boolean(customerId)),
    ),
  ];
  const serviceIds = [...new Set(appointmentRows.map((appointment) => appointment.service_id))];

  const [{ data: customers }, { data: services }] = await Promise.all([
    customerIds.length > 0
      ? supabase.from("customers").select("*").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("services").select("*").in("id", serviceIds),
  ]);

  const customersById = new Map(
    ((customers ?? []) as CustomerRecord[]).map((customer) => [customer.id, customer]),
  );
  const servicesById = new Map(
    ((services ?? []) as ServiceRecord[]).map((service) => [service.id, service]),
  );

  return appointmentRows.map((appointment) => {
    const customer = appointment.customer_id
      ? customersById.get(appointment.customer_id)
      : undefined;
    const service = servicesById.get(appointment.service_id);

    return {
      ...appointment,
      customer_name:
        customer?.full_name ?? appointment.guest_name ?? "Guest",
      customer_email:
        customer?.email ?? appointment.guest_email ?? "",
      customer_phone:
        customer?.phone ?? appointment.guest_phone ?? "",
      booking_type: appointment.customer_id ? "customer" : "guest",
      service_name: service?.name ?? "Service",
      date_label: formatZurichDate(appointment.start_at),
      time_label: formatZurichTimeRange(appointment.start_at, appointment.end_at),
    };
  });
}

async function enrichAdminAppointments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  appointmentRows: AppointmentRecord[],
) {
  if (!appointmentRows.length) {
    return [] as AdminAppointmentDetail[];
  }

  const customerIds = [
    ...new Set(
      appointmentRows
        .map((appointment) => appointment.customer_id)
        .filter((customerId): customerId is string => Boolean(customerId)),
    ),
  ];
  const serviceIds = [...new Set(appointmentRows.map((appointment) => appointment.service_id))];

  const [{ data: customers }, { data: services }] = await Promise.all([
    customerIds.length > 0
      ? supabase.from("customers").select("*").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length > 0
      ? supabase.from("services").select("*").in("id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const customersById = new Map(
    ((customers ?? []) as CustomerRecord[]).map((customer) => [customer.id, customer]),
  );
  const servicesById = new Map(
    ((services ?? []) as ServiceRecord[]).map((service) => [service.id, service]),
  );

  return appointmentRows.map((appointment) => {
    const customer = appointment.customer_id
      ? customersById.get(appointment.customer_id)
      : undefined;
    const service = servicesById.get(appointment.service_id);

    return {
      ...appointment,
      customer_name: customer?.full_name ?? appointment.guest_name ?? "Guest",
      customer_email: customer?.email ?? appointment.guest_email ?? "",
      customer_phone: customer?.phone ?? appointment.guest_phone ?? "",
      booking_type: (appointment.customer_id ? "customer" : "guest") as "customer" | "guest",
      service_name: service?.name ?? "Service",
      date_label: formatZurichDate(appointment.start_at),
      time_label: formatZurichTimeRange(appointment.start_at, appointment.end_at),
    };
  });
}

export async function getAdminAppointmentsInRange(startIso: string, endIso: string) {
  const supabase = await createClient();
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*")
    .gte("start_at", startIso)
    .lt("start_at", endIso)
    .order("start_at", { ascending: true });

  if (error || !appointments?.length) {
    return [] as AdminAppointmentDetail[];
  }

  return enrichAdminAppointments(supabase, appointments as AppointmentRecord[]);
}

export async function getAdminBusinessHours() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .order("day_of_week", { ascending: true });

  if (error) {
    return [] as BusinessHourRecord[];
  }

  return (data ?? []) as BusinessHourRecord[];
}

export async function getAvailabilityExceptionsInRange(startDateKey: string, endDateKey: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_exceptions")
    .select("*")
    .gte("date", startDateKey)
    .lte("date", endDateKey)
    .order("date", { ascending: true });

  if (error) {
    return [] as AvailabilityExceptionRecord[];
  }

  return (data ?? []) as AvailabilityExceptionRecord[];
}
