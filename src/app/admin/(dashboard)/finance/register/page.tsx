import RegisterManager from "@/components/admin/finance/RegisterManager";
import { getRegisterPageData } from "@/lib/register/server";

export default async function FinanceRegisterPage() {
  const data = await getRegisterPageData();
  return <RegisterManager data={data} />;
}
