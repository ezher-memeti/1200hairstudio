import { requireAdminUser } from "@/lib/auth/customer";
import { calculateFinancialReport, generateFinancialReportCsv, generateFinancialReportPdf, reportUtcBounds, validateFinancialReportInput } from "@/lib/finance/reports";
import type { FinancialReportRecord } from "@/lib/finance/report-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireAdminUser();
    const params = new URL(request.url).searchParams;
    const input = validateFinancialReportInput({
      periodType: params.get("periodType") ?? "",
      startDate: params.get("startDate") ?? "",
      endDate: params.get("endDate") ?? "",
      groupBy: params.get("groupBy") ?? "",
    });
    const snapshot = await calculateFinancialReport(supabase, input);
    const bounds = reportUtcBounds(input.startDate, input.endDate);
    const report: FinancialReportRecord = {
      id: "temporary",
      report_number: "FINANCIAL SUMMARY · TEMPORARY / UNSAVED",
      period_type: input.periodType,
      period_start: bounds.start,
      period_end: bounds.storedEnd,
      group_by: input.groupBy,
      currency: "CHF",
      snapshot,
      generated_by: user.id,
      generated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const format = params.get("format");
    const filename = `1200-financial-summary-${input.startDate}-to-${input.endDate}`;
    if (format === "pdf") return new Response(Buffer.from(await generateFinancialReportPdf(report)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" } });
    if (format === "csv") return new Response(generateFinancialReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"`, "Cache-Control": "private, no-store" } });
    return new Response("Choose PDF or CSV format.", { status: 400 });
  } catch (error) {
    console.error("TEMPORARY FINANCIAL REPORT EXPORT ERROR", error);
    return new Response(error instanceof Error ? error.message : "The temporary report could not be generated.", { status: 400 });
  }
}
