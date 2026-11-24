import FinanceReceipts from "@/components/admin/finance/FinanceReceipts";
import { getAdminReceipts } from "@/lib/finance/queries";

export default async function FinanceReceiptsPage() {
  return <FinanceReceipts receipts={await getAdminReceipts()} />;
}
