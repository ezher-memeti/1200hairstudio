import AdminDashboardView from "@/components/admin/AdminDashboardView";
import { getAdminDashboardData } from "@/lib/admin/dashboard";

export default async function AdminDashboardPage() {
  return <AdminDashboardView {...await getAdminDashboardData()} />;
}
