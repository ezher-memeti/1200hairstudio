import BookingSectionClient from "@/components/home/BookingSectionClient";
import { getCurrentUserRole } from "@/lib/auth/customer";
import { getBusinessHours } from "@/lib/public/business-hours";
import {
  generateUpcomingDateOptions,
  getCurrentZurichDateTime,
  getServiceBookingDuration,
} from "@/lib/public/booking-availability";
import { getAvailableSlotTimes } from "@/lib/public/available-slots";
import { formatServiceDuration, formatServicePrice, getActiveServices } from "@/lib/public/services";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveServicePrice } from "@/lib/promotions/server";
import type { HomepageContent } from "@/lib/homepage-content-defaults";
import { formatZurichDate, formatZurichTimeRange } from "@/lib/appointments/availability";
import {
  getBookingManagementUrl,
  getGuestBookingToken,
  isActiveManagedAppointment,
  resolveManagedAppointment,
} from "@/lib/appointments/management";
import type { PersistedBookingConfirmation } from "@/components/home/BookingSectionClient";
import { getBookingSettings } from "@/lib/booking/settings";

type ActiveRegisteredAppointment = {
  id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: "confirmed";
  booking_reference: string | null;
  final_price: number | null;
};

export default async function BookingSection({ content }: { content: HomepageContent }) {
  const currentZurich = getCurrentZurichDateTime();

  const [{ role, user }, services, businessHours, bookingSettings] = await Promise.all([
    getCurrentUserRole(),
    getActiveServices(),
    getBusinessHours(),
    getBookingSettings(),
  ]);
  let customerProfile: { fullName: string; email: string; phone: string } | null = null;
  let customerId: string | null = null;
  let registeredAppointment: ActiveRegisteredAppointment | null = null;
  const supabase = await createClient();
  if (role === "customer" && user) {
    const { data: customer } = await supabase.from("customers").select("id,full_name,email,phone").eq("profile_id", user.id).maybeSingle();
    if (customer) {
      customerId = customer.id;
      customerProfile = { fullName: customer.full_name, email: customer.email, phone: customer.phone };
      const { data: activeAppointment } = await supabase
        .from("appointments")
        .select("id, service_id, start_at, end_at, status, booking_reference, final_price")
        .eq("customer_id", customer.id)
        .eq("status", "confirmed")
        .gt("end_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      registeredAppointment = activeAppointment as ActiveRegisteredAppointment | null;
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
    horizonDays: bookingSettings.maximumHorizonDays + 1,
  });
  const slotEntries = await Promise.all(
    bookingServices.flatMap((service) =>
      bookingDates.map(async (date) => ({
        serviceId: service.id,
        dateKey: date.id,
        slots: await getAvailableSlotTimes(service.id, date.id, {
          bookingSettings,
          enforceCustomerPolicy: true,
        }),
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
  const bookingToken = await getGuestBookingToken();
  let persistedConfirmation: PersistedBookingConfirmation | null = null;
  let shouldClearGuestBookingCookie = false;

  if (registeredAppointment) {
    let manageUrl: string | null = null;
    if (bookingToken) {
      const managed = await resolveManagedAppointment(bookingToken);
      if (managed?.appointment.id === registeredAppointment.id) {
        manageUrl = getBookingManagementUrl(bookingToken);
      }
    }

    const service = services.find((item) => item.id === registeredAppointment?.service_id);
    persistedConfirmation = {
      serviceTitle: service?.name ?? "Service",
      price: Number(registeredAppointment.final_price ?? service?.price ?? 0),
      date: formatZurichDate(registeredAppointment.start_at).toUpperCase(),
      time: formatZurichTimeRange(registeredAppointment.start_at, registeredAppointment.end_at),
      bookingReference: registeredAppointment.booking_reference,
      manageUrl,
      status: registeredAppointment.status,
    };
  } else if (role !== "customer" && bookingToken) {
    const managed = await resolveManagedAppointment(bookingToken);
    if (managed && isActiveManagedAppointment(managed.appointment)) {
      const service = services.find((item) => item.id === managed.appointment.service_id);
      persistedConfirmation = {
        serviceTitle: service?.name ?? "Service",
        price: Number(managed.appointment.final_price ?? service?.price ?? 0),
        date: formatZurichDate(managed.appointment.start_at).toUpperCase(),
        time: formatZurichTimeRange(managed.appointment.start_at, managed.appointment.end_at),
        bookingReference: managed.appointment.booking_reference ?? null,
        manageUrl: getBookingManagementUrl(bookingToken),
        status: managed.appointment.status,
      };
    } else {
      shouldClearGuestBookingCookie = true;
    }
  } else if (role === "customer" && bookingToken && customerId) {
    const managed = await resolveManagedAppointment(bookingToken);
    if (
      !managed ||
      (managed.appointment.customer_id === customerId &&
        !isActiveManagedAppointment(managed.appointment))
    ) {
      shouldClearGuestBookingCookie = true;
    }
  }

  return (
    <BookingSectionClient
      authRole={role}
      allowGuestBookings={bookingSettings.allowGuestBookings}
      customerProfile={customerProfile}
      services={bookingServices}
      dates={visibleBookingDates}
      slotMap={slotMap}
      loadError={loadError}
      content={content}
      persistedConfirmation={persistedConfirmation}
      shouldClearGuestBookingCookie={shouldClearGuestBookingCookie}
    />
  );
}
