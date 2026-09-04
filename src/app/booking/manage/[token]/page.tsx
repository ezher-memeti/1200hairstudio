import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BookingManagementView from "@/components/booking/BookingManagementView";
import { formatZurichDate, formatZurichTimeRange } from "@/lib/appointments/availability";
import { resolveManagedAppointment } from "@/lib/appointments/management";
import { generateUpcomingDateOptions, getCurrentZurichDateTime } from "@/lib/public/booking-availability";

const INVALID_LINK_MESSAGE = "This booking could not be found or this management link is no longer valid.";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Manage Booking | 1200 Hairstudio",
  robots: { index: false, follow: false },
};

export default async function ManageBookingPage({ params }: { params: { token: string } }) {
  const managed = await resolveManagedAppointment(params.token);

  if (!managed) {
    return <><Header /><main className="page-container flex min-h-[65vh] items-center justify-center py-16"><div className="max-w-xl border border-border bg-surface p-8 text-center sm:p-12"><p className="font-primary text-[10px] uppercase tracking-[0.3em] text-accent">Manage Booking</p><h1 className="mt-5 font-display text-4xl uppercase leading-none text-foreground">Link unavailable</h1><p className="mt-5 font-primary text-sm leading-7 text-foreground-secondary">{INVALID_LINK_MESSAGE}</p></div></main><Footer /></>;
  }

  const { appointment, supabase } = managed;
  const { data: service } = await supabase.from("services").select("name").eq("id", appointment.service_id).maybeSingle();
  const canModify = appointment.status === "confirmed" && new Date(appointment.start_at).getTime() > Date.now();
  const dates = generateUpcomingDateOptions(getCurrentZurichDateTime().dateKey, { count: 14, horizonDays: 30 }).map(({ id, day, date, month }) => ({ id, day, date, month }));

  return (
    <>
      <Header />
      <main className="page-container min-h-[70vh] py-10 sm:py-16 lg:py-20">
        <BookingManagementView
          token={params.token}
          booking={{
            reference: appointment.booking_reference ?? "Booking",
            service: service?.name ?? "Service",
            date: formatZurichDate(appointment.start_at),
            time: formatZurichTimeRange(appointment.start_at, appointment.end_at),
            status: appointment.status.replace("_", " "),
            canModify,
          }}
          dates={dates}
        />
      </main>
      <Footer />
    </>
  );
}
