import { createClient } from "@/lib/supabase/server";
import { addMinutesToTime, getUtcIsoForZurichDateTime, removeBookedSlots } from "@/lib/appointments/availability";
import type { AppointmentRecord } from "@/lib/appointments/types";
import { getEffectiveHours } from "@/lib/public/booking-availability-utils";
import type { BookingSettings } from "@/lib/admin/settings";
import { validateCustomerBookingTime, type BookingPolicyContext } from "@/lib/booking/policy";
import { getBookingSettings } from "@/lib/booking/settings";

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
  bookingSettings?: BookingSettings;
  enforceCustomerPolicy?: boolean;
  bookingContext?: BookingPolicyContext;
};

function applyCustomerPolicy(
  slots: AvailableSlotRecord[],
  dateKey: string,
  settings: BookingSettings,
  enforce: boolean,
  context: BookingPolicyContext,
) {
  if (!enforce) return slots;
  const now = new Date();
  return slots.filter((slot) => !validateCustomerBookingTime(slot.slot_start, dateKey, settings, now, context));
}

function getSafeSlotInterval(settings: BookingSettings) {
  return Number.isInteger(settings.slotIntervalMinutes) && settings.slotIntervalMinutes > 0
    ? settings.slotIntervalMinutes
    : 30;
}

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
  const bookingSettings = options?.bookingSettings ?? await getBookingSettings();
  const slotIntervalMinutes = getSafeSlotInterval(bookingSettings);

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

    for (let minutes = openTotal; minutes + duration <= closeTotal; minutes += slotIntervalMinutes) {
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

    return applyCustomerPolicy(filtered.map((time) => ({
      slot_start: getUtcIsoForZurichDateTime(dateKey, time),
      slot_end: getUtcIsoForZurichDateTime(dateKey, addMinutesToTime(time, duration)),
    })), dateKey, bookingSettings, options?.enforceCustomerPolicy === true, options?.bookingContext ?? "normal");
  }

  const { data, error } = await supabase.rpc("get_available_slots", {
    p_service_id: serviceId,
    p_date: dateKey,
    p_slot_interval_minutes: slotIntervalMinutes,
  });

  if (error) {
    return [] as AvailableSlotRecord[];
  }

  const slots = ((data ?? []) as AvailableSlotRecord[]).filter(
    (slot) => Boolean(slot.slot_start) && Boolean(slot.slot_end),
  );
  return applyCustomerPolicy(slots, dateKey, bookingSettings, options?.enforceCustomerPolicy === true, options?.bookingContext ?? "normal");
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
