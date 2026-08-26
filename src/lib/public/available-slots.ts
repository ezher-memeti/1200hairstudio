import { createClient } from "@/lib/supabase/server";

const ZURICH_TIME_ZONE = "Europe/Zurich";

export type AvailableSlotRecord = {
  slot_start: string;
  slot_end: string;
};

export type AvailableSlotDisplay = AvailableSlotRecord & {
  time: string;
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
) {
  const supabase = await createClient();
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
) {
  const slots = await getAvailableSlots(serviceId, dateKey);
  return mapAvailableSlotsForDisplay(slots);
}
