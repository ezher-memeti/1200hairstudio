"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { calculateFinancialReport, reportUtcBounds } from "@/lib/finance/reports";
import type { FinancialReportGrouping, FinancialReportPeriodType } from "@/lib/finance/report-types";

function validateInput(input: { periodType: string; startDate: string; endDate: string; groupBy: string }) {
  const periodTypes = new Set<FinancialReportPeriodType>(["daily", "weekly", "monthly", "yearly", "custom"]);
  const groupings = new Set<FinancialReportGrouping>(["day", "month"]);
  if (!periodTypes.has(input.periodType as FinancialReportPeriodType)) throw new Error("Choose a valid report type.");
  if (!groupings.has(input.groupBy as FinancialReportGrouping)) throw new Error("Choose a valid report grouping.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) throw new Error("Choose a valid report period.");
  return { periodType: input.periodType as FinancialReportPeriodType, startDate: input.startDate, endDate: input.endDate, groupBy: input.groupBy as FinancialReportGrouping };
}

export async function previewFinancialReport(input: { periodType: string; startDate: string; endDate: string; groupBy: string }) {
  try {
    const values = validateInput(input);
    const { supabase } = await requireAdminUser();
    return { error: null, snapshot: await calculateFinancialReport(supabase, values) };
  } catch (error) {
    console.error("FINANCIAL REPORT PREVIEW ERROR", error);
    return { error: error instanceof Error ? error.message : "The report preview could not be generated.", snapshot: null };
  }
}

export async function generateFinancialReport(input: { periodType: string; startDate: string; endDate: string; groupBy: string }) {
  try {
    const values = validateInput(input);
    const { supabase, user } = await requireAdminUser();
    const snapshot = await calculateFinancialReport(supabase, values);
    const bounds = reportUtcBounds(values.startDate, values.endDate);
    const { data, error } = await supabase.from("financial_reports").insert({ period_type: values.periodType, period_start: bounds.start, period_end: bounds.storedEnd, group_by: values.groupBy, currency: "CHF", snapshot, generated_by: user.id }).select("*").single();
    if (error || !data) {
      console.error("FINANCIAL REPORT INSERT ERROR", error);
      return { error: "The financial report could not be saved.", report: null };
    }
    revalidatePath("/admin/finance");
    return { error: null, report: data };
  } catch (error) {
    console.error("FINANCIAL REPORT GENERATION ERROR", error);
    return { error: error instanceof Error ? error.message : "The financial report could not be generated.", report: null };
  }
}
