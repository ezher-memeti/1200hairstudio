"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, Eye, FileSpreadsheet, Plus, Printer, X } from "lucide-react";
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

export default function FinancialReportsPanel({ reports, defaultGrouping }: { reports: FinancialReportRecord[]; defaultGrouping: FinancialReportGrouping }) {
  const router = useRouter();
  const [periodType, setPeriodType] = useState<FinancialReportPeriodType>("monthly");
  const initial = periodDates("monthly");
  const [startDate, setStartDate] = useState(initial[0]);
  const [endDate, setEndDate] = useState(initial[1]);
  const [groupBy, setGroupBy] = useState<FinancialReportGrouping>(defaultGrouping);
  const [preview, setPreview] = useState<FinancialReportSnapshot | null>(null);
  const [feedback, setFeedback] = useState("");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!generatorOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [generatorOpen]);

  function changeType(value: string) { const type = value as FinancialReportPeriodType; const [start,end] = periodDates(type); setPeriodType(type); setStartDate(start); setEndDate(end); setGroupBy(defaults(type)); setPreview(null); }
  function runPreview() { startTransition(async () => { setFeedback(""); const result = await previewFinancialReport({ periodType, startDate, endDate, groupBy }); if (result.error || !result.snapshot) { setFeedback(result.error ?? "Preview failed."); return; } setPreview(result.snapshot); }); }
  function saveReport() { startTransition(async () => { setFeedback(""); const result = await generateFinancialReport({ periodType, startDate, endDate, groupBy }); if (result.error || !result.report) { setFeedback(result.error ?? "Report generation failed."); return; } setFeedback(`${result.report.report_number} generated.`); router.refresh(); }); }
  function temporaryExportUrl(format: "pdf" | "csv") { const params = new URLSearchParams({ format, periodType, startDate, endDate, groupBy }); return `/api/admin/financial-reports/temporary?${params.toString()}`; }

  return <section className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-admin-display text-3xl uppercase text-foreground">Financial Reports</h2><p className="mt-2 text-sm text-foreground-muted">Generate and export immutable accounting snapshots.</p></div><button type="button" onClick={()=>setGeneratorOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 bg-accent px-5 text-xs uppercase tracking-[.17em] text-background"><Plus size={15}/>Generate Report</button></div>
    {generatorOpen ? <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background/85 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-labelledby="financial-report-modal-title"><article className="max-h-[calc(100dvh-24px)] w-full max-w-[840px] overflow-y-auto overscroll-contain border border-border bg-surface [scrollbar-color:rgba(198,158,102,.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-accent/30">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-5 border-b border-border bg-surface px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0"><h2 id="financial-report-modal-title" className="font-admin-display text-2xl uppercase text-foreground sm:text-3xl">Generate Report</h2><p className="mt-2 max-w-xl text-sm leading-6 text-foreground-muted">Preview live financial data, then save a permanent accounting snapshot.</p></div>
        <button type="button" onClick={()=>setGeneratorOpen(false)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-border text-foreground-secondary transition-colors hover:border-accent/50 hover:text-foreground" aria-label="Close report generator"><X size={17}/></button>
      </header>
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminSelect label="Period" value={periodType} onChange={changeType} options={[{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"monthly",label:"Monthly"},{value:"yearly",label:"Yearly"},{value:"custom",label:"Custom"}]}/>
          <AdminSelect label="Grouping" value={groupBy} onChange={(value)=>{setGroupBy(value as FinancialReportGrouping);setPreview(null);}} options={[{value:"day",label:"By Day"},{value:"month",label:"By Month"}]}/>
          <DateTimePicker mode="date" label="From" value={startDate} onChange={(value)=>{setStartDate(value);setPreview(null);}} required/>
          <DateTimePicker mode="date" label="To" value={endDate} onChange={(value)=>{setEndDate(value);setPreview(null);}} required/>
        </div>
        {feedback ? <p className="mt-4 text-sm text-foreground-secondary">{feedback}</p> : null}
        {preview ? <><ReportPreview snapshot={preview}/><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="border border-border bg-background/30 p-4"><p className="text-xs uppercase tracking-[.16em] text-foreground">Temporary Download</p><p className="mt-2 text-xs leading-5 text-foreground-muted">Creates a live PDF or CSV and does not save it to Report History.</p></div><div className="border border-accent/30 bg-accent/[.04] p-4"><p className="text-xs uppercase tracking-[.16em] text-accent">Generate &amp; Save</p><p className="mt-2 text-xs leading-5 text-foreground-muted">Stores an immutable audit snapshot with a permanent report number.</p></div></div></>: null}
      </div>
      <footer className="sticky bottom-0 z-20 flex flex-col-reverse gap-3 border-t border-border bg-surface px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={()=>setGeneratorOpen(false)} className="min-h-11 border border-border px-6 font-admin-primary text-xs uppercase tracking-[.16em] text-foreground-secondary transition-colors hover:text-foreground">Cancel</button>
        {preview ? <><a href={temporaryExportUrl("pdf")} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-5 font-admin-primary text-xs uppercase tracking-[.16em] text-foreground-secondary transition-colors hover:border-accent/50 hover:text-accent"><Download size={14}/>Download PDF</a><a href={temporaryExportUrl("csv")} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-5 font-admin-primary text-xs uppercase tracking-[.16em] text-foreground-secondary transition-colors hover:border-accent/50 hover:text-accent"><FileSpreadsheet size={14}/>Download CSV</a><button type="button" disabled={pending} onClick={saveReport} className="min-h-11 bg-accent px-6 font-admin-primary text-xs uppercase tracking-[.18em] text-background disabled:opacity-40">{pending ? "Generating..." : "Generate & Save"}</button></> : <button type="button" disabled={pending} onClick={runPreview} className="min-h-11 bg-accent px-6 font-admin-primary text-xs uppercase tracking-[.18em] text-background disabled:opacity-40">{pending ? "Calculating..." : "Preview"}</button>}
      </footer>
    </article></div> : null}

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
