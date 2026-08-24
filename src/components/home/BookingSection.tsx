import BookingSectionClient from "@/components/home/BookingSectionClient";
import { getBusinessHours } from "@/lib/public/business-hours";
import {
  addDaysToDateKey,
  generateSlots,
  generateUpcomingBookingDates,
  getAvailabilityExceptions,
  getCurrentZurichDateTime,
  getServiceBookingDuration,
  groupTimeSlots,
  serializeZurichDateTime,
} from "@/lib/public/booking-availability";
import { formatServiceDuration, formatServicePrice, getActiveServices } from "@/lib/public/services";

export default async function BookingSection() {
  const currentZurich = getCurrentZurichDateTime();
  const dateTo = addDaysToDateKey(currentZurich.dateKey, 30);

  const [services, businessHours, availabilityExceptions] = await Promise.all([
    getActiveServices(),
    getBusinessHours(),
    getAvailabilityExceptions(currentZurich.dateKey, dateTo),
  ]);
  const loadError =
    services.length === 0 && businessHours.length === 0
      ? "Booking availability is unavailable right now."
      : null;
  const bookingServices = services.map((service) => ({
    id: service.id,
    title: service.name,
    description: service.description ?? "Service details coming soon",
    duration: formatServiceDuration(service),
    durationMinutes: getServiceBookingDuration(service),
    price: formatServicePrice(service.price),
    image_url: service.image_url,
  }));
  const bookingDates = generateUpcomingBookingDates(
    businessHours,
    availabilityExceptions,
    {
      startDate: currentZurich.dateKey,
      count: 10,
      horizonDays: 30,
    },
  );
  const firstAvailableDate =
    bookingDates.find((date) => date.isAvailable) ?? null;
  const firstService = bookingServices[0] ?? null;
  const initialTimeGroups =
    firstAvailableDate && firstService
      ? groupTimeSlots(
          generateSlots(
            firstAvailableDate.effectiveHours.open_time,
            firstAvailableDate.effectiveHours.close_time,
            firstService.durationMinutes,
            {
              dateKey: firstAvailableDate.id,
              currentDateTime: currentZurich,
            },
          ),
        )
      : [];

  return (
    <BookingSectionClient
      services={bookingServices}
      dates={bookingDates}
      initialTimeGroups={initialTimeGroups}
      currentZurich={serializeZurichDateTime(currentZurich)}
      loadError={loadError}
    />
  );
}
