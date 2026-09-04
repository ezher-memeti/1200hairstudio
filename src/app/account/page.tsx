import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CustomerAccountView from "@/components/account/CustomerAccountView";
import { getCustomerAppointmentSummaries } from "@/lib/appointments/queries";
import { ensureCustomerRecord } from "@/lib/auth/customer";
import { getCurrentZurichDateTime } from "@/lib/public/booking-availability";
import { getActiveServices } from "@/lib/public/services";
import { generateUpcomingDateOptions } from "@/lib/public/booking-availability";

export default async function AccountPage() {
  const customer = await ensureCustomerRecord();
  const currentZurich = getCurrentZurichDateTime();
  const services = await getActiveServices();
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
  );
  const bookingDates = generateUpcomingDateOptions(currentZurich.dateKey, {
    count: 14,
    horizonDays: 30,
  }).map(({ id, day, date, month }) => ({ id, day, date, month }));

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
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
