import FinancialReportsPanel from "@/components/admin/FinancialReportsPanel";
import { getAdminFinanceData } from "@/lib/finance/queries";

export default async function FinanceReportsPage() {
  const data = await getAdminFinanceData();
  return <FinancialReportsPanel reports={data.reports} />;
}
