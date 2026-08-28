import {
  getTodayDateKeyInZurich,
  getZurichDateKeyFromIso,
  parseDateKeyToUtcDate,
} from "../appointments/date-utils";

export type CustomerStatus =
  | "prospect"
  | "new"
  | "returning"
  | "regular"
  | "at_risk"
  | "inactive";

type StatusAppointment = {
  start_at: string;
  status: string;
  service_name: string;
};

type StatusCustomer<TAppointment extends StatusAppointment> = {
  appointment_history: TAppointment[];
};

type CustomerStatusInput = {
  completedVisits: number;
  lastCompletedAt: string | null;
  hasUpcomingAppointment: boolean;
  now?: Date;
};

export function getDaysSinceZurichDate(value: string | null, now = new Date()) {
  if (!value) {
    return null;
  }

  const lastDate = parseDateKeyToUtcDate(getZurichDateKeyFromIso(value));
  const currentDate = parseDateKeyToUtcDate(getTodayDateKeyInZurich(now));

  if (!lastDate || !currentDate) {
    return null;
  }

  return Math.max(0, Math.floor((currentDate.getTime() - lastDate.getTime()) / 86_400_000));
}

export function getCustomerStatus({
  completedVisits,
  lastCompletedAt,
  hasUpcomingAppointment,
  now = new Date(),
}: CustomerStatusInput): CustomerStatus {
  if (completedVisits === 0) {
    return hasUpcomingAppointment ? "new" : "prospect";
  }

  const daysSinceLastCompleted = getDaysSinceZurichDate(lastCompletedAt, now);

  if (!hasUpcomingAppointment && daysSinceLastCompleted !== null) {
    if (daysSinceLastCompleted > 120) {
      return "inactive";
    }

    if (daysSinceLastCompleted > 60) {
      return "at_risk";
    }
  }

  if (completedVisits === 1) {
    return "new";
  }

  if (completedVisits <= 4) {
    return "returning";
  }

  return "regular";
}

export function formatCustomerStatus(status: CustomerStatus) {
  return status === "at_risk" ? "AT RISK" : status.toUpperCase();
}

export function getCustomerInsights<TAppointment extends StatusAppointment>(
  customer: StatusCustomer<TAppointment>,
  now = new Date(),
) {
  const nowTimestamp = now.getTime();
  const completedAppointments = customer.appointment_history
    .filter((appointment) => appointment.status === "completed")
    .sort(
      (first, second) =>
        new Date(second.start_at).getTime() - new Date(first.start_at).getTime(),
    );
  const upcomingAppointments = customer.appointment_history
    .filter(
      (appointment) =>
        appointment.status === "confirmed" &&
        new Date(appointment.start_at).getTime() > nowTimestamp,
    )
    .sort(
      (first, second) =>
        new Date(first.start_at).getTime() - new Date(second.start_at).getTime(),
    );
  const serviceCounts = completedAppointments.reduce<Map<string, number>>((counts, appointment) => {
    counts.set(appointment.service_name, (counts.get(appointment.service_name) ?? 0) + 1);
    return counts;
  }, new Map());
  const favoriteService = Array.from(serviceCounts.entries()).sort(
    ([firstName, firstCount], [secondName, secondCount]) =>
      secondCount - firstCount || firstName.localeCompare(secondName),
  )[0]?.[0] ?? null;
  const lastCompletedAppointment = completedAppointments[0] ?? null;
  const nextConfirmedAppointment = upcomingAppointments[0] ?? null;
  const completedVisits = completedAppointments.length;

  return {
    status: getCustomerStatus({
      completedVisits,
      lastCompletedAt: lastCompletedAppointment?.start_at ?? null,
      hasUpcomingAppointment: Boolean(nextConfirmedAppointment),
      now,
    }),
    totalBookings: customer.appointment_history.length,
    completedVisits,
    cancelledAppointments: customer.appointment_history.filter(
      (appointment) => appointment.status === "cancelled",
    ).length,
    noShows: customer.appointment_history.filter(
      (appointment) => appointment.status === "no_show",
    ).length,
    lastCompletedAppointment,
    nextConfirmedAppointment,
    daysSinceLastCompleted: getDaysSinceZurichDate(
      lastCompletedAppointment?.start_at ?? null,
      now,
    ),
    favoriteService,
  };
}
