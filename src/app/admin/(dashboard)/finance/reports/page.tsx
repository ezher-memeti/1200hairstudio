import FinancialReportsPanel from "@/components/admin/FinancialReportsPanel";
import { getAdminFinanceData } from "@/lib/finance/queries";
import { getFinanceSettings } from "@/lib/admin/runtime-settings";

export default async function FinanceReportsPage() {
  const [data, financeSettings] = await Promise.all([getAdminFinanceData(), getFinanceSettings()]);
  return <FinancialReportsPanel reports={data.reports} defaultGrouping={financeSettings.defaultReportGrouping === "month" ? "month" : "day"} />;
}
