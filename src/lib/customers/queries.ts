import {
  formatZurichDate,
  formatZurichTimeRange,
} from "@/lib/appointments/availability";
import type { AppointmentRecord } from "@/lib/appointments/types";
import type {
  AdminCustomerAppointment,
  AdminCustomerDirectoryEntry,
  AdminCustomerLoyaltySummary,
  CustomerRecord,
} from "@/lib/customers/types";
import type { ServiceRecord } from "@/lib/services/types";
import { createClient } from "@/lib/supabase/server";
import {
  getAdminIdentitySets,
  getNonAdminCustomerProfileFilter,
  isAdminCustomerIdentity,
  normalizeEmail,
} from "@/lib/customers/admin-filter";
import { createAdminClient } from "@/lib/supabase/admin";

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
  marketing_email_consent: boolean;
  marketing_email_consented_at: string | null;
  marketing_email_consent_source: string | null;
  marketing_email_unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
  appointment_history: AdminCustomerAppointment[];
};

export async function getAdminCustomerDirectory() {
  const supabase = await createClient();
  const todayTimestamp = Date.now();
  const adminIdentities = await getAdminIdentitySets();
  const nonAdminFilter = getNonAdminCustomerProfileFilter(
    adminIdentities.adminUserIds,
  );
  let customersQuery = supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (nonAdminFilter) {
    customersQuery = customersQuery.or(nonAdminFilter);
  }

  const [
    { data: customers, error: customersError },
    { data: appointments, error: appointmentsError },
    { data: services, error: servicesError },
  ] = await Promise.all([
    customersQuery,
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

  const customerRows = ((customers ?? []) as CustomerRecord[]).filter(
    (customer) => !isAdminCustomerIdentity(customer, adminIdentities),
  );
  const excludedCustomerIds = new Set(
    ((customers ?? []) as CustomerRecord[])
      .filter((customer) => isAdminCustomerIdentity(customer, adminIdentities))
      .map((customer) => customer.id),
  );
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
      marketing_email_consent: customer.marketing_email_consent,
      marketing_email_consented_at: customer.marketing_email_consented_at,
      marketing_email_consent_source: customer.marketing_email_consent_source,
      marketing_email_unsubscribed_at: customer.marketing_email_unsubscribed_at,
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
    const appointmentEmails = [
      appointment.customer_email,
      appointment.guest_email,
    ].map(normalizeEmail);

    if (
      (appointment.customer_id && excludedCustomerIds.has(appointment.customer_id)) ||
      appointmentEmails.some(
        (email) => email && adminIdentities.adminEmails.has(email),
      )
    ) {
      continue;
    }

    const serviceName = servicesById.get(appointment.service_id) ?? "Service";
    const summary = toAppointmentSummary(appointment, serviceName);

    if (appointment.customer_id) {
      const existing = entries.get(appointment.customer_id);
      if (existing) {
        existing.appointment_history.push(summary);
      }
      continue;
    }

    const guestEmail =
      normalizeEmail(appointment.customer_email) ??
      normalizeEmail(appointment.guest_email);
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
      marketing_email_consent: false,
      marketing_email_consented_at: null,
      marketing_email_consent_source: null,
      marketing_email_unsubscribed_at: null,
      created_at: appointment.created_at,
      updated_at: appointment.updated_at,
      appointment_history: [summary],
    });
  }

  const directory = Array.from(entries.values())
    .filter(
      (entry) =>
        !isAdminCustomerIdentity(
          { email: entry.email },
          adminIdentities,
        ),
    )
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

export async function getAdminCustomerLoyaltySummaries(customerIds: string[]) {
  const summaries: Record<string, AdminCustomerLoyaltySummary> = {};
  if (!customerIds.length) return summaries;
  const admin = createAdminClient();
  const [{ data: settings, error: settingsError }, { data: visits, error: visitsError }, { data: rewards, error: rewardsError }] = await Promise.all([
    admin.from("loyalty_settings").select("is_enabled,visits_required").limit(1).maybeSingle(),
    admin.from("loyalty_visits").select("customer_id,is_eligible,reward_cycle").in("customer_id", customerIds),
    admin.from("loyalty_rewards").select("customer_id,reward_type,reward_value,status,expires_at,earned_at").in("customer_id", customerIds),
  ]);
  if (settingsError || visitsError || rewardsError) throw new Error("Unable to load customer loyalty summaries.");
  const visitsRequired = Math.max(1, Number(settings?.visits_required ?? 10));
  for (const customerId of customerIds) {
    const customerVisits = (visits ?? []).filter((visit) => visit.customer_id === customerId);
    const currentCycle = Math.max(1, ...customerVisits.map((visit) => Number(visit.reward_cycle ?? 1)));
    const eligibleVisits = Math.min(visitsRequired, customerVisits.filter((visit) => visit.is_eligible && Number(visit.reward_cycle ?? 1) === currentCycle).length);
    const availableReward = (rewards ?? [])
      .filter((reward) => reward.customer_id === customerId && reward.status === "available" && (!reward.expires_at || new Date(reward.expires_at).getTime() > Date.now()))
      .sort((first, second) => new Date(first.earned_at).getTime() - new Date(second.earned_at).getTime())[0];
    summaries[customerId] = {
      is_enabled: settings?.is_enabled ?? false,
      visits_required: visitsRequired,
      eligible_visits: eligibleVisits,
      visits_remaining: Math.max(0, visitsRequired - eligibleVisits),
      progress_percent: Math.min(100, (eligibleVisits / visitsRequired) * 100),
      available_reward: availableReward ? {
        reward_type: availableReward.reward_type as "fixed_discount" | "percentage" | "free_service",
        reward_value: availableReward.reward_value === null ? null : Number(availableReward.reward_value),
      } : null,
    };
  }
  return summaries;
}
