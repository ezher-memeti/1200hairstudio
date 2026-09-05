"use client";

import { useState, useTransition } from "react";
import { Download, Eye, FileSpreadsheet, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { generateFinancialReport, previewFinancialReport } from "@/app/actions/financial-reports";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";
import { FINANCIAL_REPORT_SECTIONS, type FinancialReportGrouping, type FinancialReportPeriodType, type FinancialReportRecord, type FinancialReportSnapshot, type FinancialReportValues } from "@/lib/finance/report-types";

const chf = (value: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(value);
const zurichToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function addDays(key: string, days: number) { const [y,m,d] = key.split("-").map(Number); const date = new Date(Date.UTC(y,m-1,d+days,12)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`; }
function periodDates(type: FinancialReportPeriodType) {
  const today = zurichToday(); const [year, month] = today.split("-").map(Number);
  if (type === "daily") return [today, today];
  if (type === "weekly") { const noon = new Date(`${today}T12:00:00Z`); const start = addDays(today, -((noon.getUTCDay()+6)%7)); return [start, addDays(start,6)]; }
  if (type === "monthly") { const end = new Date(Date.UTC(year, month, 0, 12)).getUTCDate(); return [`${today.slice(0,7)}-01`, `${today.slice(0,7)}-${String(end).padStart(2,"0")}`]; }
  if (type === "yearly") return [`${year}-01-01`, `${year}-12-31`];
  return [today, today];
}
const defaults = (type: FinancialReportPeriodType): FinancialReportGrouping => type === "yearly" ? "month" : "day";

export default function FinancialReportsPanel({ reports }: { reports: FinancialReportRecord[] }) {
  const router = useRouter();
  const [periodType, setPeriodType] = useState<FinancialReportPeriodType>("monthly");
  const initial = periodDates("monthly");
  const [startDate, setStartDate] = useState(initial[0]);
  const [endDate, setEndDate] = useState(initial[1]);
  const [groupBy, setGroupBy] = useState<FinancialReportGrouping>("day");
  const [preview, setPreview] = useState<FinancialReportSnapshot | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  function changeType(value: string) { const type = value as FinancialReportPeriodType; const [start,end] = periodDates(type); setPeriodType(type); setStartDate(start); setEndDate(end); setGroupBy(defaults(type)); setPreview(null); }
  function runPreview() { startTransition(async () => { setFeedback(""); const result = await previewFinancialReport({ periodType, startDate, endDate, groupBy }); if (result.error || !result.snapshot) { setFeedback(result.error ?? "Preview failed."); return; } setPreview(result.snapshot); }); }
  function saveReport() { startTransition(async () => { setFeedback(""); const result = await generateFinancialReport({ periodType, startDate, endDate, groupBy }); if (result.error || !result.report) { setFeedback(result.error ?? "Report generation failed."); return; } setFeedback(`${result.report.report_number} generated.`); router.refresh(); }); }

  return <section className="space-y-5">
    <article className="border border-border bg-surface">
      <div className="border-b border-border p-5"><p className="font-admin-primary text-xs uppercase tracking-[.24em] text-accent">Financial Reports</p><h2 className="mt-2 font-admin-display text-3xl uppercase text-foreground">Generate Report</h2><p className="mt-2 text-sm text-foreground-muted">Preview live financial data, then save a permanent accounting snapshot.</p></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
        <AdminSelect label="Period" value={periodType} onChange={changeType} options={[{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"monthly",label:"Monthly"},{value:"yearly",label:"Yearly"},{value:"custom",label:"Custom"}]}/>
        <DateTimePicker mode="date" label="From" value={startDate} onChange={(value)=>{setStartDate(value);setPreview(null);}} required/>
        <DateTimePicker mode="date" label="To" value={endDate} onChange={(value)=>{setEndDate(value);setPreview(null);}} required/>
        <AdminSelect label="Grouping" value={groupBy} onChange={(value)=>{setGroupBy(value as FinancialReportGrouping);setPreview(null);}} options={[{value:"day",label:"By Day"},{value:"month",label:"By Month"}]}/>
        <div className="flex items-end"><button type="button" disabled={pending} onClick={runPreview} className="min-h-11 w-full border border-accent/60 px-4 font-admin-primary text-xs uppercase tracking-[.16em] text-accent disabled:opacity-40">{pending ? "Calculating..." : "Preview"}</button></div>
      </div>
      {feedback ? <p className="px-5 pb-4 text-sm text-foreground-secondary">{feedback}</p> : null}
      {preview ? <ReportPreview snapshot={preview}/>: null}
      {preview ? <div className="flex justify-end border-t border-border p-5"><button type="button" disabled={pending} onClick={saveReport} className="min-h-11 bg-accent px-6 font-admin-primary text-xs uppercase tracking-[.18em] text-background disabled:opacity-40">{pending ? "Generating..." : "Generate Permanent Report"}</button></div> : null}
    </article>

    <article className="overflow-hidden border border-border bg-surface"><div className="border-b border-border p-5"><h2 className="font-admin-display text-2xl uppercase text-foreground">Report History</h2><p className="mt-1 text-sm text-foreground-muted">Saved reports are immutable and exports always use their stored snapshot.</p></div><div className="grid gap-3 p-4 md:hidden">{reports.map((report)=><ReportCard key={report.id} report={report}/>)}{!reports.length?<p className="p-6 text-center text-sm text-foreground-muted">No reports generated yet.</p>:null}</div><div className="hidden overflow-x-auto md:block"><table className="min-w-[980px] w-full text-left"><thead className="border-b border-border text-[10px] uppercase tracking-[.16em] text-foreground-muted"><tr>{["Report","Type","Period","Grouping","Generated","Net revenue","Payments","Generated by","Actions"].map(head=><th key={head} className="px-4 py-3 font-normal">{head}</th>)}</tr></thead><tbody>{reports.map(report=><tr key={report.id} className="border-b border-border/70 text-sm text-foreground-secondary"><td className="px-4 py-4 text-accent">{report.report_number}</td><td className="px-4 py-4 uppercase">{report.period_type}</td><td className="px-4 py-4">{report.snapshot.periodStartDate} – {report.snapshot.periodEndDate}</td><td className="px-4 py-4 uppercase">{report.group_by}</td><td className="px-4 py-4">{new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Zurich",dateStyle:"medium",timeStyle:"short"}).format(new Date(report.generated_at))}</td><td className="px-4 py-4 text-foreground">{chf(report.snapshot.totals.netRevenue)}</td><td className="px-4 py-4">{chf(report.snapshot.totals.totalPayments)}</td><td className="px-4 py-4">{report.generated_by_name ?? "Admin"}</td><td className="px-4 py-4"><ReportActions report={report}/></td></tr>)}</tbody></table>{!reports.length?<p className="p-10 text-center text-sm text-foreground-muted">No reports generated yet.</p>:null}</div></article>
  </section>;
}

function ReportPreview({ snapshot }: { snapshot: FinancialReportSnapshot }) {
  const cards: Array<[string,keyof FinancialReportValues]> = [["Gross revenue","grossRevenue"],["Discounts","discounts"],["Refunds","refunds"],["Net revenue","netRevenue"],["Paid sales","paidSales"],["Unpaid sales","unpaidSales"],["Total payments","totalPayments"],["Redemptions","totalRedemptions"]];
  const rows = [{ key: "total", label: "TOTAL", ...snapshot.totals }, ...snapshot.rows];
  return <div className="border-t border-border p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,key])=><div key={key} className="border border-border bg-background/30 p-4"><p className="text-[10px] uppercase tracking-[.14em] text-foreground-muted">{label}</p><p className={`mt-2 text-xl ${key==="netRevenue"?"text-accent":"text-foreground"}`}>{chf(snapshot.totals[key])}</p></div>)}</div>{FINANCIAL_REPORT_SECTIONS.map((section)=><section key={section.title} className="mt-6"><h3 className="font-admin-primary text-xs uppercase tracking-[.18em] text-accent">{section.title}</h3><p className="mt-1 text-[10px] text-foreground-muted">From {snapshot.periodStartDate} to {snapshot.periodEndDate} · Grouped by {snapshot.groupBy === "month" ? "Month" : "Day"}</p><div className="mt-3 overflow-x-auto border-t border-border"><table className="w-full text-left" style={{minWidth:`${Math.max(900,140+section.columns.length*120)}px`}}><thead className="text-[9px] uppercase tracking-[.1em] text-foreground-muted"><tr><th className="px-3 py-3 font-normal">Period / Datum</th>{section.columns.map(column=><th key={column.key} className="px-3 py-3 text-right font-normal">{column.label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={`${section.title}-${row.key}-${index}`} className={`border-t border-border/70 text-xs ${index===0?"bg-accent/5 font-medium text-foreground":"text-foreground-secondary"}`}><td className="px-3 py-3">{row.label}</td>{section.columns.map(column=><td key={column.key} className="px-3 py-3 text-right">{chf(row[column.key])}</td>)}</tr>)}</tbody></table></div></section>)}{!snapshot.rows.length?<p className="p-6 text-center text-sm text-foreground-muted">No financial activity in this period. The zero-value report can still be saved.</p>:null}<p className="mt-4 text-xs text-foreground-muted">Taxes, tips, gift vouchers, service fees, other sales, prepayments, and redemptions are CHF 0.00 because those values are not currently tracked.</p></div>;
}
function ReportActions({report}:{report:FinancialReportRecord}) { const url=`/api/admin/financial-reports/${report.id}`; const cls="inline-flex min-h-9 items-center gap-1.5 border border-border px-3 text-[9px] uppercase tracking-[.12em] text-foreground-secondary hover:text-accent"; return <div className="flex flex-wrap gap-2"><a href={url} target="_blank" rel="noreferrer" className={cls}><Eye size={13}/>View</a><a href={`${url}?format=pdf`} className={cls}><Download size={13}/>PDF</a><a href={`${url}?format=csv`} className={cls}><FileSpreadsheet size={13}/>CSV</a><a href={`${url}?format=print`} target="_blank" rel="noreferrer" className={cls}><Printer size={13}/>Print</a></div>; }
function ReportCard({report}:{report:FinancialReportRecord}) { return <article className="border border-border bg-background/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.14em] text-accent">{report.report_number}</p><p className="mt-2 text-sm text-foreground">{report.snapshot.periodStartDate} – {report.snapshot.periodEndDate}</p><p className="mt-1 text-xs uppercase text-foreground-muted">{report.period_type} · by {report.group_by}</p></div><strong className="whitespace-nowrap text-foreground">{chf(report.snapshot.totals.netRevenue)}</strong></div><div className="mt-4"><ReportActions report={report}/></div></article>; }
