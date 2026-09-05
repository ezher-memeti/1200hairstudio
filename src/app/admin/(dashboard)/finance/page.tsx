import FinanceOverview from "@/components/admin/finance/FinanceOverview";
import { calculateFinanceComparison } from "@/lib/finance/comparison";
import { getAdminFinanceData } from "@/lib/finance/queries";

export default async function AdminFinancePage() {
  const data = await getAdminFinanceData();
  const comparison = calculateFinanceComparison({ range: "month", transactions: data.transactions, appointments: data.appointments });
  return <FinanceOverview initialComparison={comparison} />;
}
