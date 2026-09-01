import AdminMarketingView from "@/components/admin/AdminMarketingView";
import { requireAdminUser } from "@/lib/auth/customer";
import { getMarketingDashboardData } from "@/lib/marketing/queries";
import { getActiveServices } from "@/lib/public/services";

export default async function AdminMarketingPage() {
  await requireAdminUser();
  const [dashboard, services] = await Promise.all([getMarketingDashboardData(), getActiveServices()]);
  return <AdminMarketingView {...dashboard} activeServices={services.map((service) => service.name)} />;
}

