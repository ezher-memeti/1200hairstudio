import BookingSectionClient from "@/components/home/BookingSectionClient";
import { buildBookingDates, buildTimeGroups, getBusinessHours } from "@/lib/public/business-hours";
import { formatServiceDuration, formatServicePrice, getActiveServices } from "@/lib/public/services";

export default async function BookingSection() {
  const [services, businessHours] = await Promise.all([
    getActiveServices(),
    getBusinessHours(),
  ]);

  const bookingServices =
    services.length > 0
      ? services.map((service) => ({
          id: service.id,
          title: service.name,
          description: service.description ?? "Service details coming soon",
          duration: formatServiceDuration(service),
          price: formatServicePrice(service.price),
          image_url: service.image_url,
        }))
      : [
          {
            id: "hair",
            title: "Hair",
            description: "Clean cut, styling & finish",
            duration: "30–60 MIN",
            price: "CHF 25",
            image_url: null,
          },
          {
            id: "kid",
            title: "Kid",
            description: "Clean cut for younger clients",
            duration: "30 MIN",
            price: "CHF 20",
            image_url: null,
          },
          {
            id: "hair-beard",
            title: "Hair + Beard",
            description: "Complete haircut & beard finish",
            duration: "45–60 MIN",
            price: "CHF 35",
            image_url: null,
          },
        ];

  const bookingDates = buildBookingDates(businessHours);
  const initialTimeGroups = buildTimeGroups(
    bookingDates[0]?.businessHour ?? null,
  );

  return (
    <BookingSectionClient
      services={bookingServices}
      dates={bookingDates}
      initialTimeGroups={initialTimeGroups}
    />
  );
}
