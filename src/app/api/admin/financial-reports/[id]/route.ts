import { requestLocale } from "@/i18n/http";
import { textFor } from "@/i18n/text";
import { requireAdminUser } from "@/lib/auth/customer";
import { generateFinancialReportCsv, generateFinancialReportPdf, normalizeFinancialReportRecord, safeMoney, safeText, safeZurichDateTime, reportRowLabel } from "@/lib/finance/reports";
import { FINANCIAL_REPORT_SECTIONS, type FinancialReportRecord } from "@/lib/finance/report-types";

const escapeHtml = (value: unknown) => safeText(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const chf = (value: unknown) => `CHF ${safeMoney(value).toFixed(2)}`;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = requestLocale(request);
  const t = (value: string) => textFor(locale, value.split(" / ")[0]);
  const { id } = await params;
  const { supabase } = await requireAdminUser();
  const { data, error } = await supabase.from("financial_reports").select("*").eq("id", id).maybeSingle();
  if (error || !data) return new Response("Financial report not found.", { status: 404 });
  const report = normalizeFinancialReportRecord(data as FinancialReportRecord);
  const format = new URL(request.url).searchParams.get("format") ?? "view";
  if (format === "pdf") return new Response(Buffer.from(await generateFinancialReportPdf(report, locale)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="1200-financial-report-${report.report_number}.pdf"`, "Cache-Control": "private, no-store" } });
  if (format === "csv") return new Response(generateFinancialReportCsv(report, locale), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="1200-financial-report-${report.report_number}.csv"`, "Cache-Control": "private, no-store" } });
  const rows = [{ key: "TOTAL", label: "TOTAL", ...report.snapshot.totals }, ...report.snapshot.rows];
  const metadata = `<p class="period">${t("From")} ${escapeHtml(report.snapshot.periodStartDate)} ${t("to")} ${escapeHtml(report.snapshot.periodEndDate)} &nbsp;·&nbsp; ${t("Grouped by")}: ${t(report.group_by === "month" ? "Month" : "Day")} &nbsp;·&nbsp; ${t("Generated")}: ${escapeHtml(safeZurichDateTime(report.generated_at, locale))}</p>`;
  const sections = FINANCIAL_REPORT_SECTIONS.map((section) => `<section><h2>${escapeHtml(t(section.title))}</h2>${metadata}<div class="table-wrap"><table><thead><tr><th>${t("Period")}</th>${section.columns.map((column) => `<th>${escapeHtml(t(column.label))}</th>`).join("")}</tr></thead><tbody>${rows.map((row, index) => `<tr class="${index === 0 ? "total" : ""}"><td>${escapeHtml(reportRowLabel(row.key, row.label, locale))}</td>${section.columns.map((column) => `<td>${chf(row[column.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`).join("");
  const autoPrint = format === "print" ? "<script>window.addEventListener('load',()=>window.print())</script>" : "";
  return new Response(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(report.report_number)}</title><style>body{margin:0;background:#e9e7e1;color:#171715;font:12px Arial,sans-serif}.report{max-width:1500px;margin:auto;padding:34px;background:#faf9f5}.head{display:flex;justify-content:space-between;border-bottom:1px solid #a99368;padding-bottom:18px}.brand{font-size:25px;font-weight:800}.small{font-size:8px;letter-spacing:2px;color:#716a5f}.meta{text-align:right}.meta h1{font-size:15px;margin:0}section{margin-top:38px}h2{font-size:15px;margin:0;color:#705630}.period{margin:7px 0 12px;color:#6d6961;font-size:10px}.table-wrap{overflow:auto;border-top:1px solid #aaa399}table{border-collapse:collapse;min-width:1200px;width:100%}th,td{padding:7px 8px;border-bottom:1px solid #d8d2c8;text-align:right;white-space:nowrap}th{white-space:normal;min-width:82px}th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:#faf9f5;min-width:95px}thead{font-size:8px;text-transform:uppercase;background:#ece9e1}.total td{font-weight:700;background:#f2ecdf}.actions{margin-top:30px}.actions button{padding:12px 18px;background:#171715;color:white;border:0}@media print{body{background:white}.report{max-width:none;padding:12px}.actions{display:none}section{break-before:page;margin-top:20px}section:first-of-type{break-before:auto}table{font-size:7px;min-width:0}th,td{padding:4px}thead{display:table-header-group}}@media(max-width:600px){.report{padding:24px 16px}.head{display:block}.meta{text-align:left;margin-top:20px}}</style></head><body><main class="report"><header class="head"><div><div class="brand">1200</div><div class="small">HAIRSTUDIO</div><p>Schulstrasse 2<br>8599 Salmsach, Thurgau</p></div><div class="meta"><h1>${escapeHtml(report.report_number)}</h1></div></header>${sections}<div class="actions"><button onclick="window.print()">${t("Print")}</button></div></main>${autoPrint}</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
