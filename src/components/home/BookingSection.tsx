import BookingSectionClient from "@/components/home/BookingSectionClient";
import { getCurrentUserRole } from "@/lib/auth/customer";
import { getBusinessHours } from "@/lib/public/business-hours";
import {
  addDaysToDateKey,
  generateUpcomingDateOptions,
  getCurrentZurichDateTime,
  getServiceBookingDuration,
} from "@/lib/public/booking-availability";
import { getAvailableSlotTimes } from "@/lib/public/available-slots";
import { formatServiceDuration, formatServicePrice, getActiveServices } from "@/lib/public/services";
import { createClient } from "@/lib/supabase/server";

export default async function BookingSection() {
  const currentZurich = getCurrentZurichDateTime();
  const dateTo = addDaysToDateKey(currentZurich.dateKey, 30);

  const [{ role, user }, services, businessHours] = await Promise.all([
    getCurrentUserRole(),
    getActiveServices(),
    getBusinessHours(),
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
  const bookingDates = generateUpcomingDateOptions(currentZurich.dateKey, {
    count: 10,
    horizonDays: 30,
  });
  const slotEntries = await Promise.all(
    bookingServices.flatMap((service) =>
      bookingDates.map(async (date) => ({
        serviceId: service.id,
        dateKey: date.id,
        slots: await getAvailableSlotTimes(service.id, date.id),
      })),
    ),
  );
  const slotMap = slotEntries.reduce<
    Record<string, Record<string, { time: string; slot_start: string; slot_end: string }[]>>
  >((accumulator, entry) => {
    if (!accumulator[entry.serviceId]) {
      accumulator[entry.serviceId] = {};
    }

    accumulator[entry.serviceId][entry.dateKey] = entry.slots;
    return accumulator;
  }, {});
  const firstServiceId = bookingServices[0]?.id ?? null;
  const visibleBookingDates = bookingDates.map((date) => ({
    ...date,
    isAvailable: Boolean(firstServiceId && slotMap[firstServiceId]?.[date.id]?.length),
  }));
  const firstAvailableDate =
    visibleBookingDates.find((date) => date.isAvailable) ?? null;
  let customerProfile:
    | {
        fullName: string;
        email: string;
        phone: string;
      }
    | null = null;

  if (role === "customer" && user) {
    const supabase = await createClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("full_name, email, phone")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (customer) {
      customerProfile = {
        fullName: customer.full_name,
        email: customer.email,
        phone: customer.phone,
      };
    }
  }

  return (
    <BookingSectionClient
      authRole={role}
      customerProfile={customerProfile}
      services={bookingServices}
      dates={visibleBookingDates}
      slotMap={slotMap}
      loadError={loadError}
    />
  );
}
