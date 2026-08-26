import type { AppointmentRecord, AppointmentStatus } from "@/lib/appointments/types";

const ZURICH_TIME_ZONE = "Europe/Zurich";

export const BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "confirmed",
  "completed",
  "no_show",
];

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

function parseTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return {
    hours,
    minutes,
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(date);
  const offsetLabel =
    parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

export function getUtcDateForZurichDateTime(dateKey: string, time: string) {
  const dateParts = parseDateKey(dateKey);
  const timeParts = parseTime(time);

  if (!dateParts || !timeParts) {
    throw new Error("Invalid appointment date or time.");
  }

  const utcTimestamp = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hours,
    timeParts.minutes,
    0,
    0,
  );
  const initialGuess = new Date(utcTimestamp);
  const initialOffset = getTimeZoneOffsetMinutes(initialGuess, ZURICH_TIME_ZONE);
  let resolvedDate = new Date(utcTimestamp - initialOffset * 60_000);
  const resolvedOffset = getTimeZoneOffsetMinutes(resolvedDate, ZURICH_TIME_ZONE);

  if (resolvedOffset !== initialOffset) {
    resolvedDate = new Date(utcTimestamp - resolvedOffset * 60_000);
  }

  return resolvedDate;
}

export function getUtcIsoForZurichDateTime(dateKey: string, time: string) {
  return getUtcDateForZurichDateTime(dateKey, time).toISOString();
}

export function formatZurichDate(isoString: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(isoString));
}

export function formatZurichTime(isoString: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoString));
}

export function formatZurichTimeRange(startAt: string, endAt: string) {
  return `${formatZurichTime(startAt)}–${formatZurichTime(endAt)}`;
}

export function isBlockingAppointmentStatus(status: AppointmentStatus) {
  return BLOCKING_APPOINTMENT_STATUSES.includes(status);
}

export function filterBlockingAppointments(appointments: AppointmentRecord[]) {
  return appointments.filter((appointment) =>
    isBlockingAppointmentStatus(appointment.status),
  );
}

export function addMinutesToTime(time: string, minutesToAdd: number) {
  const parsed = parseTime(time);

  if (!parsed) {
    throw new Error("Invalid time.");
  }

  const totalMinutes = parsed.hours * 60 + parsed.minutes + minutesToAdd;
  const normalizedHours = Math.floor(totalMinutes / 60);
  const normalizedMinutes = totalMinutes % 60;

  return `${String(normalizedHours).padStart(2, "0")}:${String(
    normalizedMinutes,
  ).padStart(2, "0")}`;
}

export function removeBookedSlots(
  slots: string[],
  dateKey: string,
  serviceDuration: number,
  appointments: AppointmentRecord[],
) {
  if (slots.length === 0 || appointments.length === 0) {
    return slots;
  }

  const blockingAppointments = filterBlockingAppointments(appointments);

  if (blockingAppointments.length === 0) {
    return slots;
  }

  return slots.filter((slot) => {
    const candidateStart = getUtcDateForZurichDateTime(dateKey, slot).getTime();
    const candidateEnd = getUtcDateForZurichDateTime(
      dateKey,
      addMinutesToTime(slot, serviceDuration),
    ).getTime();

    return !blockingAppointments.some((appointment) => {
      const existingStart = new Date(appointment.start_at).getTime();
      const existingEnd = new Date(appointment.end_at).getTime();

      return existingStart < candidateEnd && existingEnd > candidateStart;
    });
  });
}
