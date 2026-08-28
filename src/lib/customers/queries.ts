import {
  formatZurichDate,
  formatZurichTimeRange,
} from "@/lib/appointments/availability";
import type { AppointmentRecord } from "@/lib/appointments/types";
import type {
  AdminCustomerAppointment,
  AdminCustomerDirectoryEntry,
  CustomerRecord,
} from "@/lib/customers/types";
import type { ServiceRecord } from "@/lib/services/types";
import { createClient } from "@/lib/supabase/server";

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D+/g, "");
}

function normalizeName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function getAppointmentTimestamp(value: string) {
  return new Date(value).getTime();
}

function toAppointmentSummary(
  appointment: AppointmentRecord,
  serviceName: string,
): AdminCustomerAppointment {
  return {
    id: appointment.id,
    service_id: appointment.service_id,
    service_name: serviceName,
    start_at: appointment.start_at,
    end_at: appointment.end_at,
    status: appointment.status,
    booking_source: appointment.booking_source ?? null,
    created_at: appointment.created_at,
    date_label: formatZurichDate(appointment.start_at),
    time_label: formatZurichTimeRange(appointment.start_at, appointment.end_at),
  };
}

function buildGuestKey(appointment: AppointmentRecord) {
  const email = normalizeEmail(appointment.customer_email ?? appointment.guest_email);
  if (email) {
    return `email:${email}`;
  }

  const phone = normalizePhone(appointment.customer_phone ?? appointment.guest_phone);
  if (phone) {
    return `phone:${phone}`;
  }

  const name = normalizeName(appointment.customer_name ?? appointment.guest_name);
  if (name) {
    return `name:${name.toLowerCase()}`;
  }

  return `appointment:${appointment.id}`;
}

type MutableCustomerEntry = {
  id: string;
  type: "registered" | "guest";
  full_name: string;
  email: string;
  phone: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  appointment_history: AdminCustomerAppointment[];
};

export async function getAdminCustomerDirectory() {
  const supabase = await createClient();
  const todayTimestamp = Date.now();

  const [
    { data: customers, error: customersError },
    { data: appointments, error: appointmentsError },
    { data: services, error: servicesError },
  ] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("appointments").select("*").order("start_at", { ascending: true }),
    supabase.from("services").select("id, name, price, duration_min, duration_max").order("sort_order", {
      ascending: true,
    }),
  ]);

  if (customersError) {
    throw new Error(`Unable to load customers: ${customersError.message}`);
  }

  if (appointmentsError) {
    throw new Error(`Unable to load appointments: ${appointmentsError.message}`);
  }

  if (servicesError) {
    throw new Error(`Unable to load services: ${servicesError.message}`);
  }

  const customerRows = (customers ?? []) as CustomerRecord[];
  const appointmentRows = (appointments ?? []) as AppointmentRecord[];
  const serviceRows = (services ?? []) as Pick<
    ServiceRecord,
    "id" | "name" | "price" | "duration_min" | "duration_max"
  >[];
  const servicesById = new Map(serviceRows.map((service) => [service.id, service.name]));

  const entries = new Map<string, MutableCustomerEntry>();
  const emailToCustomerId = new Map<string, string>();
  const phoneToCustomerId = new Map<string, string>();

  for (const customer of customerRows) {
    const id = customer.id;
    entries.set(id, {
      id,
      type: customer.is_registered ? "registered" : "guest",
      full_name: customer.full_name,
      email: customer.email,
      phone: customer.phone,
      notes: customer.notes,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
      appointment_history: [],
    });

    const email = normalizeEmail(customer.email);
    const phone = normalizePhone(customer.phone);
    if (email) {
      emailToCustomerId.set(email, id);
    }
    if (phone) {
      phoneToCustomerId.set(phone, id);
    }
  }

  for (const appointment of appointmentRows) {
    const serviceName = servicesById.get(appointment.service_id) ?? "Service";
    const summary = toAppointmentSummary(appointment, serviceName);

    if (appointment.customer_id) {
      const existing = entries.get(appointment.customer_id);
      if (existing) {
        existing.appointment_history.push(summary);
      }
      continue;
    }

    const guestEmail = normalizeEmail(appointment.customer_email ?? appointment.guest_email);
    const guestPhone = normalizePhone(appointment.customer_phone ?? appointment.guest_phone);
    const matchedCustomerId =
      (guestEmail ? emailToCustomerId.get(guestEmail) : undefined) ??
      (guestPhone ? phoneToCustomerId.get(guestPhone) : undefined);

    if (matchedCustomerId) {
      entries.get(matchedCustomerId)?.appointment_history.push(summary);
      continue;
    }

    const guestKey = `legacy-guest:${buildGuestKey(appointment)}`;
    const existingGuest = entries.get(guestKey);

    if (existingGuest) {
      existingGuest.appointment_history.push(summary);
      if (!existingGuest.email && guestEmail) {
        existingGuest.email = appointment.customer_email ?? appointment.guest_email ?? "";
      }
      if (!existingGuest.phone && guestPhone) {
        existingGuest.phone = appointment.customer_phone ?? appointment.guest_phone ?? "";
      }
      if (!existingGuest.full_name) {
        existingGuest.full_name =
          appointment.customer_name ?? appointment.guest_name ?? "Guest";
      }
      continue;
    }

    entries.set(guestKey, {
      id: guestKey,
      type: "guest",
      full_name: appointment.customer_name ?? appointment.guest_name ?? "Guest",
      email: appointment.customer_email ?? appointment.guest_email ?? "",
      phone: appointment.customer_phone ?? appointment.guest_phone ?? "",
      notes: null,
      created_at: appointment.created_at,
      updated_at: appointment.updated_at,
      appointment_history: [summary],
    });
  }

  const directory = Array.from(entries.values())
    .map<AdminCustomerDirectoryEntry>((entry) => {
      const history = entry.appointment_history
        .slice()
        .sort(
          (first, second) =>
            getAppointmentTimestamp(first.start_at) - getAppointmentTimestamp(second.start_at),
        );
      const upcoming =
        history.find(
          (appointment) =>
            appointment.status === "confirmed" &&
            getAppointmentTimestamp(appointment.end_at) >= todayTimestamp,
        ) ?? null;
      const past = history
        .filter(
          (appointment) =>
            appointment.status === "completed" &&
            getAppointmentTimestamp(appointment.end_at) < todayTimestamp,
        )
        .sort(
          (first, second) =>
            getAppointmentTimestamp(second.start_at) - getAppointmentTimestamp(first.start_at),
        );
      const newestTimestamp = history.reduce((latest, appointment) => {
        const appointmentCreated = getAppointmentTimestamp(appointment.start_at);
        return Math.max(latest, appointmentCreated);
      }, getAppointmentTimestamp(entry.created_at));

      return {
        ...entry,
        created_at: entry.created_at,
        updated_at: new Date(Math.max(getAppointmentTimestamp(entry.updated_at), newestTimestamp)).toISOString(),
        total_appointments: history.length,
        upcoming_appointment: upcoming,
        last_appointment: past[0] ?? null,
        appointment_history: history
          .slice()
          .sort(
            (first, second) =>
              getAppointmentTimestamp(second.start_at) - getAppointmentTimestamp(first.start_at),
          ),
      };
    })
    .sort((first, second) => first.full_name.localeCompare(second.full_name));

  return directory;
}
