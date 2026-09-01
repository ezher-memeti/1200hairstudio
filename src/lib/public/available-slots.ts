import { createClient } from "@/lib/supabase/server";
import { addMinutesToTime, getUtcIsoForZurichDateTime, removeBookedSlots } from "@/lib/appointments/availability";
import type { AppointmentRecord } from "@/lib/appointments/types";
import { getEffectiveHours } from "@/lib/public/booking-availability-utils";

const ZURICH_TIME_ZONE = "Europe/Zurich";

export type AvailableSlotRecord = {
  slot_start: string;
  slot_end: string;
};

export type AvailableSlotDisplay = AvailableSlotRecord & {
  time: string;
};

type GetAvailableSlotsOptions = {
  excludeAppointmentId?: string;
};

function formatZurichTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export async function getAvailableSlots(
  serviceId: string,
  dateKey: string,
  options?: GetAvailableSlotsOptions,
) {
  const supabase = await createClient();

  if (options?.excludeAppointmentId) {
    const nextDate = new Date(`${dateKey}T12:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(
      nextDate.getDate(),
    ).padStart(2, "0")}`;

    const [{ data: service }, { data: businessHours }, { data: exceptions }, { data: appointments }] =
      await Promise.all([
        supabase
          .from("services")
          .select("duration_min, duration_max")
          .eq("id", serviceId)
          .maybeSingle(),
        supabase.from("business_hours").select("*").order("day_of_week", { ascending: true }),
        supabase
          .from("availability_exceptions")
          .select("*")
          .eq("date", dateKey),
        supabase
          .from("appointments")
          .select("*")
          .gte("start_at", getUtcIsoForZurichDateTime(dateKey, "00:00"))
          .lt("start_at", getUtcIsoForZurichDateTime(nextDateKey, "00:00"))
          .neq("id", options.excludeAppointmentId)
          .order("start_at", { ascending: true }),
      ]);

    if (!service || !businessHours) {
      return [] as AvailableSlotRecord[];
    }

    const exceptionsByDate = new Map((exceptions ?? []).map((exception) => [exception.date, exception]));
    const effectiveHours = getEffectiveHours(
      new Date(`${dateKey}T12:00:00`),
      businessHours ?? [],
      exceptionsByDate,
    );

    if (
      effectiveHours.is_closed ||
      !effectiveHours.open_time ||
      !effectiveHours.close_time
    ) {
      return [] as AvailableSlotRecord[];
    }

    const duration = service.duration_max ?? service.duration_min;
    const [openHour, openMinute] = effectiveHours.open_time.split(":").map(Number);
    const [closeHour, closeMinute] = effectiveHours.close_time.split(":").map(Number);
    const openTotal = openHour * 60 + openMinute;
    const closeTotal = closeHour * 60 + closeMinute;
    const candidateTimes: string[] = [];

    for (let minutes = openTotal; minutes + duration <= closeTotal; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      candidateTimes.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }

    const filtered = removeBookedSlots(
      candidateTimes,
      dateKey,
      duration,
      (appointments ?? []) as AppointmentRecord[],
    );

    return filtered.map((time) => ({
      slot_start: getUtcIsoForZurichDateTime(dateKey, time),
      slot_end: getUtcIsoForZurichDateTime(dateKey, addMinutesToTime(time, duration)),
    }));
  }

  const { data, error } = await supabase.rpc("get_available_slots", {
    p_service_id: serviceId,
    p_date: dateKey,
  });

  if (error) {
    return [] as AvailableSlotRecord[];
  }

  return ((data ?? []) as AvailableSlotRecord[]).filter(
    (slot) => Boolean(slot.slot_start) && Boolean(slot.slot_end),
  );
}

export function mapAvailableSlotsForDisplay(slots: AvailableSlotRecord[]) {
  return slots.map((slot) => ({
    ...slot,
    time: formatZurichTime(slot.slot_start),
  })) as AvailableSlotDisplay[];
}

export async function getAvailableSlotTimes(
  serviceId: string,
  dateKey: string,
  options?: GetAvailableSlotsOptions,
) {
  const slots = await getAvailableSlots(serviceId, dateKey, options);
  return mapAvailableSlotsForDisplay(slots);
}
