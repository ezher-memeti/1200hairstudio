"use client";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";

import { reportRowLabel } from "@/i18n/format";
import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useEffect, useState, useTransition } from "react";
import { Download, Eye, FileSpreadsheet, Plus, Printer, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
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
  const locale = useLocale();

  const uiText = useUiText();

  const ui = useTranslations("ui");

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
  function temporaryExportUrl(format: "pdf" | "csv") { const params = new URLSearchParams({ locale, format, periodType, startDate, endDate, groupBy }); return `/api/admin/financial-reports/temporary?${params.toString()}`; }

  return <section className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-admin-display text-3xl uppercase text-foreground">{ui("m39c53cc68d21")}</h2><p className="mt-2 text-sm text-foreground-muted">{ui("m4d1dc71406a6")}</p></div><button type="button" onClick={()=>setGeneratorOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 bg-accent px-5 text-xs uppercase tracking-[.17em] text-background"><Plus size={15}/>{ui("m7ff2ef7dfeb8")}</button></div>
    {generatorOpen ? <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background/85 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-labelledby="financial-report-modal-title"><article className="max-h-[calc(100dvh-24px)] w-full max-w-[840px] overflow-y-auto overscroll-contain border border-border bg-surface [scrollbar-color:rgba(198,158,102,.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-accent/30">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-5 border-b border-border bg-surface px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0"><h2 id="financial-report-modal-title" className="font-admin-display text-2xl uppercase text-foreground sm:text-3xl">{ui("m7ff2ef7dfeb8")}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-foreground-muted">{ui("m2a6746d42b24")}</p></div>
        <button type="button" onClick={()=>setGeneratorOpen(false)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-border text-foreground-secondary transition-colors hover:border-accent/50 hover:text-foreground" aria-label={ui("m62a05e8ea229")}><X size={17}/></button>
      </header>
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminSelect label={ui("m170a28a9db6d")} value={periodType} onChange={changeType} options={[{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"monthly",label:"Monthly"},{value:"yearly",label:"Yearly"},{value:"custom",label:"Custom"}]}/>
          <AdminSelect label={ui("m2ae6967b07a4")} value={groupBy} onChange={(value)=>{setGroupBy(value as FinancialReportGrouping);setPreview(null);}} options={[{value:"day",label:"By Day"},{value:"month",label:"By Month"}]}/>
          <DateTimePicker mode="date" label={ui("m3f66052a107e")} value={startDate} onChange={(value)=>{setStartDate(value);setPreview(null);}} required/>
          <DateTimePicker mode="date" label={ui("mae79ea1e9c63")} value={endDate} onChange={(value)=>{setEndDate(value);setPreview(null);}} required/>
        </div>
        {feedback ? <p className="mt-4 text-sm text-foreground-secondary">{uiText(feedback)}</p> : null}
        {preview ? <><ReportPreview snapshot={preview}/><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="border border-border bg-background/30 p-4"><p className="text-xs uppercase tracking-[.16em] text-foreground">{ui("m88e129169a92")}</p><p className="mt-2 text-xs leading-5 text-foreground-muted">{ui("md01cdd62834c")}</p></div><div className="border border-accent/30 bg-accent/[.04] p-4"><p className="text-xs uppercase tracking-[.16em] text-accent">{ui("md513c19ac188")}</p><p className="mt-2 text-xs leading-5 text-foreground-muted">{ui("m1a32eee974b6")}</p></div></div></>: null}
      </div>
      <footer className="sticky bottom-0 z-20 flex flex-col-reverse gap-3 border-t border-border bg-surface px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={()=>setGeneratorOpen(false)} className="min-h-11 border border-border px-6 font-admin-primary text-xs uppercase tracking-[.16em] text-foreground-secondary transition-colors hover:text-foreground">{ui("m77dfd2135f4d")}</button>
        {preview ? <><a href={temporaryExportUrl("pdf")} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-5 font-admin-primary text-xs uppercase tracking-[.16em] text-foreground-secondary transition-colors hover:border-accent/50 hover:text-accent"><Download size={14}/>{ui("m98e5ef062b2a")}</a><a href={temporaryExportUrl("csv")} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-5 font-admin-primary text-xs uppercase tracking-[.16em] text-foreground-secondary transition-colors hover:border-accent/50 hover:text-accent"><FileSpreadsheet size={14}/>{ui("meaa216ad406c")}</a><button type="button" disabled={pending} onClick={saveReport} className="min-h-11 bg-accent px-6 font-admin-primary text-xs uppercase tracking-[.18em] text-background disabled:opacity-40">{uiText(pending ? "Generating..." : "Generate & Save")}</button></> : <button type="button" disabled={pending} onClick={runPreview} className="min-h-11 bg-accent px-6 font-admin-primary text-xs uppercase tracking-[.18em] text-background disabled:opacity-40">{uiText(pending ? "Calculating..." : "Preview")}</button>}
      </footer>
    </article></div> : null}

    <article className="overflow-hidden border border-border bg-surface"><div className="border-b border-border p-5"><h2 className="font-admin-display text-2xl uppercase text-foreground">{ui("m6f0202f58069")}</h2><p className="mt-1 text-sm text-foreground-muted">{ui("m7eef99ed0adf")}</p></div><div className="grid gap-3 p-4 md:hidden">{reports.map((report)=><ReportCard key={report.id} report={report}/>)}{!reports.length?<p className="p-6 text-center text-sm text-foreground-muted">{ui("mc257f96888a4")}</p>:null}</div><div className="hidden overflow-x-auto md:block"><table className="min-w-[980px] w-full text-left"><thead className="border-b border-border text-[10px] uppercase tracking-[.16em] text-foreground-muted"><tr>{["Report","Type","Period","Grouping","Generated","Net revenue","Payments","Generated by","Actions"].map(head=><th key={head} className="px-4 py-3 font-normal">{uiText(head)}</th>)}</tr></thead><tbody>{reports.map(report=><tr key={report.id} className="border-b border-border/70 text-sm text-foreground-secondary"><td className="px-4 py-4 text-accent">{report.report_number}</td><td className="px-4 py-4 uppercase">{uiText(report.period_type)}</td><td className="px-4 py-4">{report.snapshot.periodStartDate} – {report.snapshot.periodEndDate}</td><td className="px-4 py-4 uppercase">{report.group_by}</td><td className="px-4 py-4">{new Intl.DateTimeFormat(intlLocale(locale),{timeZone:"Europe/Zurich",dateStyle:"medium",timeStyle:"short"}).format(new Date(report.generated_at))}</td><td className="px-4 py-4 text-foreground">{chf(report.snapshot.totals.netRevenue)}</td><td className="px-4 py-4">{chf(report.snapshot.totals.totalPayments)}</td><td className="px-4 py-4">{report.generated_by_name ?? uiText("Admin")}</td><td className="px-4 py-4"><ReportActions report={report}/></td></tr>)}</tbody></table>{!reports.length?<p className="p-10 text-center text-sm text-foreground-muted">{ui("mc257f96888a4")}</p>:null}</div></article>
  </section>;
}

function ReportPreview({ snapshot }: { snapshot: FinancialReportSnapshot }) {
  const uiText = useUiText();
  const locale = useLocale();

  const ui = useTranslations("ui");

  const cards: Array<[string,keyof FinancialReportValues]> = [["Gross revenue","grossRevenue"],["Discounts","discounts"],["Refunds","refunds"],["Net revenue","netRevenue"],["Paid sales","paidSales"],["Unpaid sales","unpaidSales"],["Total payments","totalPayments"],["Redemptions","totalRedemptions"]];
  const rows = [{ key: "total", label: "TOTAL", ...snapshot.totals }, ...snapshot.rows];
  return <div className="border-t border-border p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,key])=><div key={key} className="border border-border bg-background/30 p-4"><p className="text-[10px] uppercase tracking-[.14em] text-foreground-muted">{uiText(label)}</p><p className={`mt-2 text-xl ${key==="netRevenue"?"text-accent":"text-foreground"}`}>{chf(snapshot.totals[key])}</p></div>)}</div>{FINANCIAL_REPORT_SECTIONS.map((section)=><section key={section.title} className="mt-6"><h3 className="font-admin-primary text-xs uppercase tracking-[.18em] text-accent">{uiText(section.title)}</h3><p className="mt-1 text-[10px] text-foreground-muted">{ui("m3f66052a107e")}{" "}{snapshot.periodStartDate} {" "}{ui("m4374aaee247f")}{" "}{snapshot.periodEndDate} {" "}{ui("m3f31e5fa8d8b")}{" "}{uiText(snapshot.groupBy === "month" ? "Month" : "Day")}</p><div className="mt-3 overflow-x-auto border-t border-border"><table className="w-full text-left" style={{minWidth:`${Math.max(900,140+section.columns.length*120)}px`}}><thead className="text-[9px] uppercase tracking-[.1em] text-foreground-muted"><tr><th className="px-3 py-3 font-normal">{uiText("Period")}</th>{section.columns.map(column=><th key={column.key} className="px-3 py-3 text-right font-normal">{uiText(column.label.split(" / ")[0])}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={`${section.title}-${row.key}-${index}`} className={`border-t border-border/70 text-xs ${index===0?"bg-accent/5 font-medium text-foreground":"text-foreground-secondary"}`}><td className="px-3 py-3">{reportRowLabel(row.key, row.label, locale)}</td>{section.columns.map(column=><td key={column.key} className="px-3 py-3 text-right">{chf(row[column.key])}</td>)}</tr>)}</tbody></table></div></section>)}{!snapshot.rows.length?<p className="p-6 text-center text-sm text-foreground-muted">{ui("m3124fd6c4a93")}</p>:null}<p className="mt-4 text-xs text-foreground-muted">{ui("mf0e067592ea0")}</p></div>;
}
function ReportActions({report}:{report:FinancialReportRecord}) {
  const ui = useTranslations("ui");
 const url=`/api/admin/financial-reports/${report.id}`; const cls="inline-flex min-h-9 items-center gap-1.5 border border-border px-3 text-[9px] uppercase tracking-[.12em] text-foreground-secondary hover:text-accent"; return <div className="flex flex-wrap gap-2"><a href={url} target="_blank" rel="noreferrer" className={cls}><Eye size={13}/>{ui("m69bd4ef9fbd0")}</a><a href={`${url}?format=pdf`} className={cls}><Download size={13}/>PDF</a><a href={`${url}?format=csv`} className={cls}><FileSpreadsheet size={13}/>CSV</a><a href={`${url}?format=print`} target="_blank" rel="noreferrer" className={cls}><Printer size={13}/>{ui("m5b221e9c2a45")}</a></div>; }
function ReportCard({report}:{report:FinancialReportRecord}) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  const ui = useTranslations("ui");
 return <article className="border border-border bg-background/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.14em] text-accent">{report.report_number}</p><p className="mt-2 text-sm text-foreground">{report.snapshot.periodStartDate} – {report.snapshot.periodEndDate}</p><p className="mt-1 text-xs uppercase text-foreground-muted">{displayText(report.period_type)} {" "}{ui("mbb37dabe3e19")}{" "}{report.group_by}</p></div><strong className="whitespace-nowrap text-foreground">{chf(report.snapshot.totals.netRevenue)}</strong></div><div className="mt-4"><ReportActions report={report}/></div></article>; }
