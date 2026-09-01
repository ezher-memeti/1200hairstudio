import AdminCustomersView from "@/components/admin/AdminCustomersView";
import { requireAdminUser } from "@/lib/auth/customer";
import { getAdminCustomerDirectory } from "@/lib/customers/queries";
import { getActiveServices } from "@/lib/public/services";

export default async function AdminCustomersPage() {
  await requireAdminUser();
  const [customers, services] = await Promise.all([
    getAdminCustomerDirectory(),
    getActiveServices(),
  ]);

  return <AdminCustomersView customers={customers} activeServices={services.map((service) => service.name)} todayIso={new Date().toISOString()} />;
}
