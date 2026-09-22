import SalesManager from "@/components/admin/finance/SalesManager";
import { getAdminSales } from "@/lib/sales/server";
import { getFinanceSettings } from "@/lib/admin/runtime-settings";

export default async function FinanceSalesPage(){const [sales,settings]=await Promise.all([getAdminSales(),getFinanceSettings()]);return <SalesManager sales={sales} enabledPaymentMethods={settings.enabledPaymentMethods}/>;}
