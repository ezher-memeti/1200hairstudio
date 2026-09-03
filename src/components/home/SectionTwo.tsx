import SectionTwoClient from "@/components/home/SectionTwoClient";
import {
  addDaysToDateKey,
  createBookingDateOption,
  getCurrentZurichDateTime,
  parseDateKey,
} from "@/lib/public/booking-availability";
import { formatBusinessHourTime, getBusinessHours } from "@/lib/public/business-hours";
import { getAvailabilityExceptions } from "@/lib/public/booking-availability";
import { getAvailableSlotTimes } from "@/lib/public/available-slots";
import { getActiveServices } from "@/lib/public/services";
import type { HomepageContent } from "@/lib/homepage-content-defaults";

export default async function SectionTwo({ content }: { content: HomepageContent }) {
  const currentZurich = getCurrentZurichDateTime();
  const dateFrom = currentZurich.dateKey;
  const dateTo = addDaysToDateKey(currentZurich.dateKey, 30);

  try {
    const [businessHours, exceptions, services] = await Promise.all([
      getBusinessHours(),
      getAvailabilityExceptions(dateFrom, dateTo),
      getActiveServices(),
    ]);
    const previewService = services[0] ?? null;
    let preview = null;

    if (previewService) {
      for (let offset = 0; offset < 30; offset += 1) {
        const dateKey = addDaysToDateKey(currentZurich.dateKey, offset);
        const slots = await getAvailableSlotTimes(previewService.id, dateKey);

        if (slots.length === 0) {
          continue;
        }

        const date = parseDateKey(dateKey);

        if (!date) {
          continue;
        }

        const bookingDate = createBookingDateOption(date);
        const effectiveHours =
          exceptions.find((exception) => exception.date === dateKey) ??
          businessHours.find((hour) => hour.day_of_week === bookingDate.effectiveHours.day_of_week) ??
          null;
        const closeTime =
          "close_time" in (effectiveHours ?? {}) ? formatBusinessHourTime(effectiveHours?.close_time ?? null) : null;
        const openTime =
          "open_time" in (effectiveHours ?? {}) ? formatBusinessHourTime(effectiveHours?.open_time ?? null) : null;
        const label =
          offset === 0 ? "TODAY" : offset === 1 ? "TOMORROW" : bookingDate.fullDate.split(",")[0];

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

    return <SectionTwoClient preview={preview} hasError={false} content={content} />;
  } catch {
    return <SectionTwoClient preview={null} hasError content={content} />;
  }
}
