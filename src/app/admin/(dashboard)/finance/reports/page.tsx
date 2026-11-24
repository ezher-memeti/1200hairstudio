import FinancialReportsPanel from "@/components/admin/FinancialReportsPanel";
import { getAdminFinancialReports } from "@/lib/finance/queries";
import { getFinanceSettings } from "@/lib/admin/runtime-settings";

export default async function FinanceReportsPage() {
  const [reports, financeSettings] = await Promise.all([getAdminFinancialReports(), getFinanceSettings()]);
  return <FinancialReportsPanel reports={reports} defaultGrouping={financeSettings.defaultReportGrouping === "month" ? "month" : "day"} />;
}
