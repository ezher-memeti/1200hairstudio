import FinanceTransactions from "@/components/admin/finance/FinanceTransactions";
import { getAdminFinanceData } from "@/lib/finance/queries";

export default async function FinanceTransactionsPage() {
  const data = await getAdminFinanceData();
  return <FinanceTransactions transactions={data.transactions} services={data.services} />;
}
