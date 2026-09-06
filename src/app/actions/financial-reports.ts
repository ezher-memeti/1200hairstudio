"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { calculateFinancialReport, reportUtcBounds, validateFinancialReportInput } from "@/lib/finance/reports";
import { getRuntimeSettings } from "@/lib/admin/runtime-settings";

export async function previewFinancialReport(input: { periodType: string; startDate: string; endDate: string; groupBy: string }) {
  try {
    const values = validateFinancialReportInput(input);
    const { supabase } = await requireAdminUser();
    const settings = await getRuntimeSettings();
    return { error: null, snapshot: await calculateFinancialReport(supabase, values, settings) };
  } catch (error) {
    console.error("FINANCIAL REPORT PREVIEW ERROR", error);
    return { error: error instanceof Error ? error.message : "The report preview could not be generated.", snapshot: null };
  }
}

export async function generateFinancialReport(input: { periodType: string; startDate: string; endDate: string; groupBy: string }) {
  try {
    const values = validateFinancialReportInput(input);
    const { supabase, user } = await requireAdminUser();
    const settings = await getRuntimeSettings();
    const snapshot = await calculateFinancialReport(supabase, values, settings);
    const bounds = reportUtcBounds(values.startDate, values.endDate);
    const { data, error } = await supabase.from("financial_reports").insert({ period_type: values.periodType, period_start: bounds.start, period_end: bounds.storedEnd, group_by: values.groupBy, currency: settings.finance.currency, snapshot, generated_by: user.id }).select("*").single();
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
