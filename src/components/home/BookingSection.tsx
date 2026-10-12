import BookingSectionClient from "@/components/home/BookingSectionClient";
import { getServiceBookingDuration } from "@/lib/public/booking-availability";
import { formatServiceDuration, formatServicePrice, getActiveServices } from "@/lib/public/services";
import { createPublicClient } from "@/lib/supabase/public";
import { getEffectiveServicePrice } from "@/lib/promotions/server";
import type { HomepageContent } from "@/lib/homepage-content-defaults";
import { getBookingSettings } from "@/lib/booking/settings";

export default async function BookingSection({ content }: { content: HomepageContent }) {
  const [services, bookingSettings] = await Promise.all([
    getActiveServices(),
    getBookingSettings(),
  ]);
  const publicSupabase = createPublicClient();
  const effectivePrices = new Map((await Promise.all(services.map(async (service) => [service.id, await getEffectiveServicePrice({ serviceId: service.id, authenticatedCustomer: false, supabase: publicSupabase })] as const))).filter((entry) => entry[1]));
  const loadError = null;
  const bookingServices = services.map((service) => ({
    id: service.id,
    title: service.name,
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
  return (
    <BookingSectionClient
      authRole={null}
      allowGuestBookings={bookingSettings.allowGuestBookings}
      customerProfile={null}
      services={bookingServices}
      loadError={loadError}
      content={content}
      persistedConfirmation={null}
      shouldClearGuestBookingCookie={false}
      loyaltyReward={null}
    />
  );
}
