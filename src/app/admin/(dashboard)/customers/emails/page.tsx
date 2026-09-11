import AdminEmailHistoryView from "@/components/admin/AdminEmailHistoryView";
import CustomersNavigation from "@/components/admin/CustomersNavigation";
import { requireAdminUser } from "@/lib/auth/customer";
import { getAdminEmailHistory, type EmailHistoryStatusFilter, type EmailHistoryTypeFilter } from "@/lib/customers/email-logs";

type SearchParams = Record<string, string | string[] | undefined>;
const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function AdminCustomerEmailHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireAdminUser();
  const filters = {
    search: valueOf(searchParams.search),
    customerId: valueOf(searchParams.customer),
    type: (valueOf(searchParams.type) || "all") as EmailHistoryTypeFilter,
    status: (valueOf(searchParams.status) || "all") as EmailHistoryStatusFilter,
    page: Number(valueOf(searchParams.page) || 1),
  };
  let result;
  let error = "";
  try {
    result = await getAdminEmailHistory(supabase, filters);
  } catch (cause) {
    console.error("ADMIN EMAIL HISTORY PAGE ERROR", cause);
    error = cause instanceof Error ? cause.message : "Unable to load customer email history.";
    result = { rows: [], total: 0, page: 1, pageSize: 25 };
  }

  return <section className="space-y-7"><div><p className="text-xs uppercase tracking-[.3em] text-foreground-muted">Customer Communications</p><h1 className="mt-3 font-admin-display text-[clamp(2.2rem,5vw,4.25rem)] uppercase leading-none text-foreground">Email History</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">Delivery records for application emails sent to customers.</p></div><CustomersNavigation/>{error ? <div className="border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div> : null}<AdminEmailHistoryView rows={result.rows} total={result.total} page={result.page} pageSize={result.pageSize} filters={filters}/></section>;
}
