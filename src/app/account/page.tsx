import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CustomerAccountView from "@/components/account/CustomerAccountView";
import { getCustomerAppointmentSummaries } from "@/lib/appointments/queries";
import { ensureCustomerRecord } from "@/lib/auth/customer";
import { getCurrentZurichDateTime } from "@/lib/public/booking-availability";
import { getActiveServices } from "@/lib/public/services";
import { generateUpcomingDateOptions } from "@/lib/public/booking-availability";
import { getBookingSettings } from "@/lib/booking/settings";
import { getCustomerManagementCapabilities } from "@/lib/booking/policy";
import { getReceiptsForCustomer } from "@/lib/receipts/server";
import { getMyLoyaltySummary } from "@/lib/loyalty/customer-summary";
import { getRecurringBookings } from "@/lib/recurring-bookings/service";

export default async function AccountPage() {
  const customer = await ensureCustomerRecord();
  const currentZurich = getCurrentZurichDateTime();
  const [services, bookingSettings, receipts, loyalty, recurringBookings] = await Promise.all([
    getActiveServices(),
    getBookingSettings(),
    getReceiptsForCustomer(customer.id),
    getMyLoyaltySummary(customer.id),
    getRecurringBookings(customer.id),
  ]);
  const appointmentSummaries = await getCustomerAppointmentSummaries(
    customer,
    services,
    currentZurich,
  );
  const now = Date.now();
  const upcomingAppointments = appointmentSummaries.filter(
    (appointment) =>
      appointment.status === "confirmed" &&
      new Date(appointment.end_at).getTime() > now,
  );
  const pastAppointments = appointmentSummaries.filter(
    (appointment) =>
      appointment.status !== "confirmed" ||
      new Date(appointment.end_at).getTime() <= now,
  ).sort(
    (first, second) =>
      new Date(second.start_at).getTime() - new Date(first.start_at).getTime(),
  );
  const bookingDates = generateUpcomingDateOptions(currentZurich.dateKey, {
    count: 14,
    horizonDays: bookingSettings.maximumHorizonDays + 1,
  }).map(({ id, day, date, month }) => ({ id, day, date, month }));
  const bookingCapabilities = Object.fromEntries(
    upcomingAppointments.map((appointment) => [appointment.id, getCustomerManagementCapabilities(appointment, bookingSettings)]),
  );

  return (
    <>
      <Header />
      <main className="bg-background">
        <section className="page-container py-12 sm:py-16 lg:py-20">
          <CustomerAccountView
            customer={{
              id: customer.id,
              full_name: customer.full_name,
              email: customer.email,
              phone: customer.phone,
              marketing_email_consent: customer.marketing_email_consent,
              marketing_email_consented_at: customer.marketing_email_consented_at,
              marketing_email_consent_source: customer.marketing_email_consent_source,
              marketing_email_unsubscribed_at: customer.marketing_email_unsubscribed_at,
            }}
            upcomingAppointments={upcomingAppointments}
            pastAppointments={pastAppointments}
            bookingDates={bookingDates}
            bookingCapabilities={bookingCapabilities}
            receipts={receipts}
            loyalty={loyalty}
            services={services.map((service) => ({ id: service.id, name: service.name }))}
            recurringBookings={recurringBookings}
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
