import AdminFinanceView from "@/components/admin/AdminFinanceView";
import { getAdminFinanceData } from "@/lib/finance/queries";

export default async function AdminFinancePage() {
  const data = await getAdminFinanceData();
  return <AdminFinanceView {...data} />;
}
