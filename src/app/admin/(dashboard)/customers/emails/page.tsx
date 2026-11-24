import { safeLogDetails } from "@/lib/logging";
import { textFor } from "@/i18n/text";
import { getLocale } from "next-intl/server";

import { getTranslations } from "next-intl/server";
import AdminEmailHistoryView from "@/components/admin/AdminEmailHistoryView";
import CustomersNavigation from "@/components/admin/CustomersNavigation";
import { requireAdminUser } from "@/lib/auth/customer";
import { getAdminEmailHistory, type EmailHistoryStatusFilter, type EmailHistoryTypeFilter } from "@/lib/customers/email-logs";

type SearchParams = Record<string, string | string[] | undefined>;
const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function AdminCustomerEmailHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const uiLocale = await getLocale();
  const uiText = <T,>(value: T): T => typeof value === "string" ? textFor(uiLocale, value) as T : value;

  const ui = await getTranslations("ui");

  const { supabase } = await requireAdminUser();
  const resolvedSearchParams = await searchParams;
  const filters = {
    search: valueOf(resolvedSearchParams.search),
    customerId: valueOf(resolvedSearchParams.customer),
    type: (valueOf(resolvedSearchParams.type) || "all") as EmailHistoryTypeFilter,
    status: (valueOf(resolvedSearchParams.status) || "all") as EmailHistoryStatusFilter,
    page: Number(valueOf(resolvedSearchParams.page) || 1),
  };
  let result;
  let error = "";
  try {
    result = await getAdminEmailHistory(supabase, filters);
  } catch (cause) {
    console.error("ADMIN EMAIL HISTORY PAGE ERROR", safeLogDetails(cause));
    error = cause instanceof Error ? cause.message : "Unable to load customer email history.";
    result = { rows: [], total: 0, page: 1, pageSize: 25 };
  }

  return <section className="space-y-7"><div><p className="text-xs uppercase tracking-[.3em] text-foreground-muted">{ui("ma507bcb0e236")}</p><h1 className="mt-3 font-admin-display text-[clamp(2.2rem,5vw,4.25rem)] uppercase leading-none text-foreground">{ui("mb1b1939bdee1")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">{ui("m65d51687f69f")}</p></div><CustomersNavigation/>{error ? <div className="border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{uiText(error)}</div> : null}<AdminEmailHistoryView rows={result.rows} total={result.total} page={result.page} pageSize={result.pageSize} filters={filters}/></section>;
}
