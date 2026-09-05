import FinanceReceipts from "@/components/admin/finance/FinanceReceipts";
import { getAdminFinanceData } from "@/lib/finance/queries";

export default async function FinanceReceiptsPage() {
  const data = await getAdminFinanceData();
  return <FinanceReceipts receipts={data.receipts} />;
}
