import SectionTwoClient from "@/components/home/SectionTwoClient";
import { getAvailabilityExceptions } from "@/lib/public/booking-availability";
import {
  buildNextAvailabilityPreview,
  getCurrentZurichDateTime,
} from "@/lib/public/booking-availability";
import { getBusinessHours } from "@/lib/public/business-hours";
import { getActiveServices } from "@/lib/public/services";

export default async function SectionTwo() {
  const currentZurich = getCurrentZurichDateTime();
  const dateFrom = currentZurich.dateKey;
  const horizonDate = new Date(currentZurich.date);
  horizonDate.setDate(horizonDate.getDate() + 30);
  const dateTo = `${horizonDate.getFullYear()}-${String(horizonDate.getMonth() + 1).padStart(2, "0")}-${String(horizonDate.getDate()).padStart(2, "0")}`;

  try {
    const [businessHours, exceptions, services] = await Promise.all([
      getBusinessHours(),
      getAvailabilityExceptions(dateFrom, dateTo),
      getActiveServices(),
    ]);

    const preview = buildNextAvailabilityPreview(
      businessHours,
      exceptions,
      services.map((service) => ({
        duration_min: service.duration_min,
        is_active: service.is_active,
      })),
      {
        currentDateTime: currentZurich,
        horizonDays: 30,
        visibleSlotsCount: 3,
      },
    );

    return <SectionTwoClient preview={preview} hasError={false} />;
  } catch {
    return <SectionTwoClient preview={null} hasError />;
  }
}
