import AdminMarketingView from "@/components/admin/AdminMarketingView";
import { requireAdminUser } from "@/lib/auth/customer";
import { getMarketingDashboardData } from "@/lib/marketing/queries";
import { getAdminPromotions } from "@/lib/promotions/queries";
import { getActiveServices } from "@/lib/public/services";

export default async function AdminMarketingPage() {
  await requireAdminUser();
  const [dashboard, services, promotions] = await Promise.all([getMarketingDashboardData(), getActiveServices(), getAdminPromotions()]);
  return <AdminMarketingView {...dashboard} services={services} promotions={promotions} activeServices={services.map((service) => service.name)} />;
}
