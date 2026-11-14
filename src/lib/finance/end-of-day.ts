import "server-only";

import { requireAdminUser } from "@/lib/auth/customer";
import { getRuntimeSettings } from "@/lib/admin/runtime-settings";
import { calculateFinancialReport, reportUtcBounds } from "@/lib/finance/reports";
import { getRegisterSessionDetail } from "@/lib/register/server";
import type { RegisterSessionRecord } from "@/lib/register/types";

export async function getEndOfDay(date: string) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
  const [{ supabase }, settings] = await Promise.all([requireAdminUser(), getRuntimeSettings()]);
  const bounds = reportUtcBounds(safeDate, safeDate);
  const [{ data: appointments }, { data: sessions }, { data: sales }, report] = await Promise.all([
    supabase.from("appointments").select("status").gte("start_at", bounds.start).lt("start_at", bounds.endExclusive),
    supabase.from("register_sessions").select("*").gte("opened_at", bounds.start).lt("opened_at", bounds.endExclusive).order("opened_at"),
    supabase.from("sales").select("loyalty_discount").gte("completed_at", bounds.start).lt("completed_at", bounds.endExclusive),
    calculateFinancialReport(supabase, { periodType: "daily", startDate: safeDate, endDate: safeDate, groupBy: "day" }, settings),
  ]);
  const registerDetails = await Promise.all(((sessions ?? []) as RegisterSessionRecord[]).map((session) => getRegisterSessionDetail(session, settings.finance.enabledPaymentMethods, supabase)));
  const count = (status: string) => (appointments ?? []).filter((appointment) => appointment.status === status).length;
  const loyaltyRedemptions = (sales ?? []).reduce((sum, sale) => sum + Number(sale.loyalty_discount ?? 0), 0);
  return { date: safeDate, appointments: { completed: count("completed"), cancelled: count("cancelled"), noShow: count("no_show") }, finance: report.totals, loyaltyRedemptions, registers: registerDetails };
}
