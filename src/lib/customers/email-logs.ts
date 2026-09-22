import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerEmailLog } from "@/lib/customers/types";

export const EMAIL_HISTORY_PAGE_SIZE = 25;

export const EMAIL_TYPE_FILTERS = {
  appointment_confirmation: ["appointment_confirmation"],
  appointment_rescheduled: ["appointment_rescheduled"],
  appointment_cancelled: ["appointment_cancelled"],
  appointment_reminder: ["appointment_reminder"],
  regular_booking: ["regular_booking_confirmation", "regular_booking_updated", "regular_booking_removed", "regular_booking_paused", "regular_booking_resumed"],
  receipt: ["receipt"],
  marketing: ["marketing"],
  other: ["other"],
} as const;

export type EmailHistoryTypeFilter = "all" | keyof typeof EMAIL_TYPE_FILTERS;
export type EmailHistoryStatusFilter = "all" | "sent" | "failed" | "processing" | "skipped";

export type AdminEmailHistoryRow = CustomerEmailLog & { customer_name: string | null };

export async function getAdminEmailHistory(
  supabase: SupabaseClient,
  input: {
    search?: string;
    customerId?: string;
    type?: EmailHistoryTypeFilter;
    status?: EmailHistoryStatusFilter;
    page?: number;
    pageSize?: number;
  },
) {
  const search = input.search?.trim() ?? "";
  const customerId = input.customerId?.trim() ?? "";
  const type = input.type && (input.type === "all" || input.type in EMAIL_TYPE_FILTERS) ? input.type : "all";
  const status = input.status && ["all", "sent", "failed", "processing", "skipped"].includes(input.status) ? input.status : "all";
  const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize ?? EMAIL_HISTORY_PAGE_SIZE)));
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const from = (page - 1) * pageSize;

  let matchingCustomerIds: string[] = [];
  if (search) {
    const { data, error } = await supabase.from("customers").select("id").ilike("full_name", `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`).limit(200);
    if (error) throw new Error("Unable to search customer email history.");
    matchingCustomerIds = (data ?? []).map((customer) => customer.id);
  }

  let query = supabase
    .from("customer_email_logs")
    .select("id,customer_id,appointment_id,recipient_email,email_type,subject,status,provider_message_id,sent_at,failed_at,error_message,metadata,created_at", { count: "exact" });

  if (customerId) query = query.eq("customer_id", customerId);
  if (type !== "all") query = query.in("email_type", [...EMAIL_TYPE_FILTERS[type]]);
  if (status !== "all") query = query.eq("status", status);
  if (search) {
    const safeSearch = search.replace(/[(),]/g, " ").trim();
    const clauses = [`recipient_email.ilike.%${safeSearch}%`];
    if (matchingCustomerIds.length) clauses.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
    query = query.or(clauses.join(","));
  }

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) {
    console.error("ADMIN EMAIL HISTORY QUERY ERROR", { input, error });
    throw new Error("Unable to load customer email history.");
  }

  const logs = (data ?? []) as CustomerEmailLog[];
  const customerIds = [...new Set(logs.map((log) => log.customer_id).filter((value): value is string => Boolean(value)))];
  const customerNames = new Map<string, string>();
  if (customerIds.length) {
    const { data: customers, error: customersError } = await supabase.from("customers").select("id,full_name").in("id", customerIds);
    if (customersError) throw new Error("Unable to resolve email recipients.");
    for (const customer of customers ?? []) customerNames.set(customer.id, customer.full_name);
  }

  return {
    rows: logs.map((log) => ({ ...log, customer_name: log.customer_id ? customerNames.get(log.customer_id) ?? null : null })),
    total: count ?? 0,
    page,
    pageSize,
  };
}
