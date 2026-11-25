import AdminCustomersView from "@/components/admin/AdminCustomersView";
import { requireAdminUser } from "@/lib/auth/customer";
import { getAdminCustomerDirectory, getAdminCustomerLoyaltySummaries } from "@/lib/customers/queries";
import { getActiveServices } from "@/lib/public/services";
import { getRecurringBookings } from "@/lib/recurring-bookings/service";

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requireAdminUser();
  const { customerId } = await searchParams;
  const [customers, services, recurringBookings] = await Promise.all([
    getAdminCustomerDirectory(),
    getActiveServices(),
    getRecurringBookings(),
  ]);
  const loyaltySummaries = await getAdminCustomerLoyaltySummaries(customers.filter((customer) => !customer.id.startsWith("legacy-guest:")).map((customer) => customer.id));

  return <AdminCustomersView initialCustomerId={customerId} customers={customers} activeServices={services.map((service) => ({ id: service.id, name: service.name, sourceName: service.source_name ?? service.name }))} recurringBookings={recurringBookings} loyaltySummaries={loyaltySummaries} todayIso={new Date().toISOString()} />;
}
