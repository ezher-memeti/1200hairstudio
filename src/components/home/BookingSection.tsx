import BookingSectionClient from "@/components/home/BookingSectionClient";
import { getBusinessHours } from "@/lib/public/business-hours";
import {
  generateSlots,
  generateUpcomingBookingDates,
  getAvailabilityExceptions,
  getServiceBookingDuration,
  groupTimeSlots,
} from "@/lib/public/booking-availability";
import { formatServiceDuration, formatServicePrice, getActiveServices } from "@/lib/public/services";

export default async function BookingSection() {
  const [services, businessHours, availabilityExceptions] = await Promise.all([
    getActiveServices(),
    getBusinessHours(),
    getAvailabilityExceptions("2026-08-22", "2026-09-21"),
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
      startDate: new Date("2026-08-22T12:00:00"),
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
          ),
        )
      : [];

  return (
    <BookingSectionClient
      services={bookingServices}
      dates={bookingDates}
      initialTimeGroups={initialTimeGroups}
      loadError={loadError}
    />
  );
}
