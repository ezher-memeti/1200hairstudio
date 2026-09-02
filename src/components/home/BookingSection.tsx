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
import { getEffectiveServicePrice } from "@/lib/promotions/server";

export default async function BookingSection() {
  const currentZurich = getCurrentZurichDateTime();
  const dateTo = addDaysToDateKey(currentZurich.dateKey, 30);

  const [{ role, user }, services, businessHours] = await Promise.all([
    getCurrentUserRole(),
    getActiveServices(),
    getBusinessHours(),
  ]);
  let customerProfile: { fullName: string; email: string; phone: string } | null = null;
  let customerId: string | null = null;
  const supabase = await createClient();
  if (role === "customer" && user) {
    const { data: customer } = await supabase.from("customers").select("id,full_name,email,phone").eq("profile_id", user.id).maybeSingle();
    if (customer) {
      customerId = customer.id;
      customerProfile = { fullName: customer.full_name, email: customer.email, phone: customer.phone };
    }
  }
  const effectivePrices = new Map((await Promise.all(services.map(async (service) => [service.id, await getEffectiveServicePrice({ serviceId: service.id, customerId, authenticatedCustomer: role === "customer", supabase })] as const))).filter((entry) => entry[1]));
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
    originalPrice: service.price,
    finalPrice: effectivePrices.get(service.id)?.finalPrice ?? service.price,
    discountAmount: effectivePrices.get(service.id)?.discountAmount ?? 0,
    discountType: effectivePrices.get(service.id)?.discountType ?? null,
    discountValue: effectivePrices.get(service.id)?.discountValue ?? null,
    promotionId: effectivePrices.get(service.id)?.promotionId ?? null,
    promotionName: effectivePrices.get(service.id)?.promotionName ?? null,
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
