"use server";

import {
  addDaysToDateKey,
  createBookingDateOption,
  generateUpcomingDateOptions,
  getCurrentZurichDateTime,
  getAvailabilityExceptions,
  parseDateKey,
} from "@/lib/public/booking-availability";
import { getAvailableSlotTimes } from "@/lib/public/available-slots";
import { getBookingSettings } from "@/lib/booking/settings";
import { formatBusinessHourTime, getBusinessHours } from "@/lib/public/business-hours";
import { getActiveServices } from "@/lib/public/services";
import type { NextAvailabilityPreview } from "@/lib/public/booking-availability-utils";

export async function getServiceBookingAvailability(serviceId: string) {
  const normalizedServiceId = serviceId.trim();

  if (!normalizedServiceId) {
    return { error: "Choose a service first.", dates: [], slotsByDate: {} };
  }

  const bookingSettings = await getBookingSettings();
  const currentZurich = getCurrentZurichDateTime();
  const dates = generateUpcomingDateOptions(currentZurich.dateKey, {
    count: 10,
    horizonDays: bookingSettings.maximumHorizonDays + 1,
  });
  const slotEntries = await Promise.all(
    dates.map(async (date) => [
      date.id,
      await getAvailableSlotTimes(normalizedServiceId, date.id, {
        bookingSettings,
        enforceCustomerPolicy: true,
      }),
    ] as const),
  );
  const slotsByDate = Object.fromEntries(slotEntries);

  return {
    error: null,
    dates: dates.map((date) => ({
      ...date,
      isAvailable: Boolean(slotsByDate[date.id]?.length),
    })),
    slotsByDate,
  };
}

export async function getNextAvailabilityPreview() {
  try {
    const currentZurich = getCurrentZurichDateTime();
    const dateFrom = currentZurich.dateKey;
    const bookingSettings = await getBookingSettings();
    const dateTo = addDaysToDateKey(
      currentZurich.dateKey,
      bookingSettings.maximumHorizonDays,
    );
    const [businessHours, exceptions, services] = await Promise.all([
      getBusinessHours(),
      getAvailabilityExceptions(dateFrom, dateTo),
      getActiveServices(),
    ]);
    const previewService = services[0] ?? null;
    let preview: NextAvailabilityPreview | null = null;

    if (previewService) {
      for (let offset = 0; offset <= bookingSettings.maximumHorizonDays; offset += 1) {
        const dateKey = addDaysToDateKey(currentZurich.dateKey, offset);
        const slots = await getAvailableSlotTimes(previewService.id, dateKey, {
          bookingSettings,
          enforceCustomerPolicy: true,
        });

        if (slots.length === 0) continue;

        const date = parseDateKey(dateKey);
        if (!date) continue;

        const bookingDate = createBookingDateOption(date);
        const effectiveHours =
          exceptions.find((exception) => exception.date === dateKey) ??
          businessHours.find(
            (hour) => hour.day_of_week === bookingDate.effectiveHours.day_of_week,
          ) ??
          null;
        const closeTime =
          "close_time" in (effectiveHours ?? {})
            ? formatBusinessHourTime(effectiveHours?.close_time ?? null)
            : null;
        const openTime =
          "open_time" in (effectiveHours ?? {})
            ? formatBusinessHourTime(effectiveHours?.open_time ?? null)
            : null;
        const label =
          offset === 0
            ? "TODAY"
            : offset === 1
              ? "TOMORROW"
              : bookingDate.fullDate.split(",")[0];

        preview = {
          dateKey,
          label,
          weekday: bookingDate.fullDate.split(",")[0],
          dayNumber: bookingDate.date,
          month: bookingDate.month,
          year: String(date.getFullYear()),
          fullDateLabel: bookingDate.fullDate,
          status:
            offset === 0 && closeTime
              ? `OPEN TODAY · UNTIL ${closeTime}`
              : offset === 1 && openTime
                ? `OPENS TOMORROW · ${openTime}`
                : closeTime
                  ? `OPEN · UNTIL ${closeTime}`
                  : "NO AVAILABILITY",
          slots: slots.slice(0, 3).map((slot) => slot.time),
          effectiveHours: bookingDate.effectiveHours,
        };
        break;
      }
    }

    return { preview, hasError: false };
  } catch {
    return { preview: null, hasError: true };
  }
}
