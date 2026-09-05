"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, Eye, Mail, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { resendAdminReceipt } from "@/app/actions/finance";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";
import FinanceTransactionDialog from "@/components/admin/FinanceTransactionDialog";
import FinancialReportsPanel from "@/components/admin/FinancialReportsPanel";
import type { FinanceAppointment, FinancePromotion, FinanceTransaction, TransactionType } from "@/lib/finance/types";
import type { ServiceRecord } from "@/lib/services/types";
import type { ReceiptRecord } from "@/lib/receipts/types";
import type { FinancialReportRecord } from "@/lib/finance/report-types";

type Range = "today" | "week" | "month" | "year" | "custom";
const formatMoney = (value: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(value);
const dateKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const displayDate = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function startForRange(range: Range, now: Date) {
  const key = dateKey(now);
  const [year, month, day] = key.split("-").map(Number);
  const local = new Date(Date.UTC(year, month - 1, day, 12));
  if (range === "week") local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  if (range === "month") local.setUTCDate(1);
  if (range === "year") { local.setUTCMonth(0); local.setUTCDate(1); }
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

export default function AdminFinanceView({ transactions, appointments, services, promotions, receipts, reports }: { transactions: FinanceTransaction[]; appointments: FinanceAppointment[]; services: ServiceRecord[]; promotions: FinancePromotion[]; receipts: ReceiptRecord[]; reports: FinancialReportRecord[] }) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [service, setService] = useState("all");
  const [type, setType] = useState("all");
  const [grouping, setGrouping] = useState("daily");
  const [dialog, setDialog] = useState<{ appointment: FinanceAppointment; type: TransactionType } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [emailingReceiptId, setEmailingReceiptId] = useState<string | null>(null);
  const [isEmailPending, startEmailTransition] = useTransition();
  const now = useMemo(() => new Date(), []);
  const today = dateKey(now);
  const filtered = useMemo(() => transactions.filter((item) => {
    const itemDate = dateKey(new Date(item.paid_at));
    const start = range === "custom" ? customStart : startForRange(range, now);
    const end = range === "custom" ? customEnd : today;
    return (!start || itemDate >= start) && (!end || itemDate <= end) && (method === "all" || item.payment_method === method) && (status === "all" || item.status === status) && (service === "all" || item.service_id === service) && (type === "all" || item.transaction_type === type);
  }), [customEnd, customStart, method, now, range, service, status, today, transactions, type]);
  const completed = filtered.filter((item) => item.status === "completed");
  const payments = completed.filter((item) => item.transaction_type === "payment");
  const refunds = completed.filter((item) => item.transaction_type === "refund");
  const gross = payments.reduce((sum, item) => sum + item.amount, 0);
  const refundTotal = refunds.reduce((sum, item) => sum + item.amount, 0);
  const net = gross - refundTotal;
  const allCompleted = transactions.filter((item) => item.status === "completed");
  const allPayments = allCompleted.filter((item) => item.transaction_type === "payment");
  const allRefunds = allCompleted.filter((item) => item.transaction_type === "refund");
  const allGross = allPayments.reduce((sum, item) => sum + item.amount, 0);
  const allRefundTotal = allRefunds.reduce((sum, item) => sum + item.amount, 0);
  const periodTotal = (start: string) => transactions.filter((item) => item.status === "completed" && dateKey(new Date(item.paid_at)) >= start && dateKey(new Date(item.paid_at)) <= today).reduce((sum, item) => sum + (item.transaction_type === "payment" ? item.amount : -item.amount), 0);
  const chart = useMemo(() => {
    const values = new Map<string, number>();
    completed.forEach((item) => {
      const date = new Date(item.paid_at);
      let key = dateKey(date);
      if (grouping === "monthly") key = key.slice(0, 7);
      if (grouping === "weekly") {
        const day = new Date(`${key}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7)); key = dateKey(day);
      }
      values.set(key, (values.get(key) ?? 0) + (item.transaction_type === "payment" ? item.amount : -item.amount));
    });
    return [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  }, [completed, grouping]);
  const maxChart = Math.max(...chart.map(([, value]) => Math.abs(value)), 1);
  const counts = { paid: appointments.filter((item) => item.paymentStatus === "paid").length, unpaid: appointments.filter((item) => item.paymentStatus === "unpaid").length, partial: appointments.filter((item) => ["partially_paid", "partial"].includes(item.paymentStatus)).length };
  const discounts = appointments.reduce((sum, item) => sum + item.discountAmount, 0);

  function exportCsv() {
    const rows = [["Date", "Booking reference", "Customer", "Service", "Transaction type", "Amount", "Payment method", "Status"], ...filtered.map((item) => [item.paid_at, item.booking_reference, item.customer_name, item.service_name, item.transaction_type, item.amount.toFixed(2), item.payment_method, item.status])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `1200-finance-${today}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  function emailReceipt(receiptId: string) {
    setEmailingReceiptId(receiptId);
    startEmailTransition(async () => {
      const result = await resendAdminReceipt(receiptId);
      setFeedback(result.error ?? "Receipt emailed to the customer.");
      setEmailingReceiptId(null);
      if (!result.error) router.refresh();
    });
  }

  const metricCards = [
    ["Total Revenue", formatMoney(allGross)], ["Revenue This Month", formatMoney(periodTotal(startForRange("month", now)))],
    ["Revenue This Week", formatMoney(periodTotal(startForRange("week", now)))], ["Revenue Today", formatMoney(periodTotal(today))],
    ["Total Refunds", formatMoney(allRefundTotal)], ["Net Revenue", formatMoney(allGross - allRefundTotal)],
    ["Average Ticket", formatMoney(allPayments.length ? allGross / allPayments.length : 0)], ["Discounts Given", formatMoney(discounts)],
  ];

  return <section className="space-y-8">
    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">Finance</p><h1 className="mt-4 font-admin-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[.95] tracking-[-.04em] text-foreground">Finance</h1><p className="mt-3 font-admin-primary text-sm text-foreground-secondary">Completed payments, refunds, balances, and revenue in CHF.</p></div><button type="button" onClick={exportCsv} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-5 font-admin-primary text-xs uppercase tracking-[.18em] text-foreground-secondary hover:text-foreground"><Download size={15}/> Export CSV</button></div>
    <FinancialReportsPanel reports={reports}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(([label, value]) => <article key={label} className="border border-border bg-surface p-5"><p className="font-admin-primary text-[10px] uppercase tracking-[.18em] text-foreground-muted">{label}</p><p className="mt-3 font-admin-display text-3xl tracking-[-.03em] text-foreground">{value}</p></article>)}</div>
    <div className="grid gap-3 sm:grid-cols-3"><article className="border border-border bg-surface p-4"><span className="text-foreground-muted">Paid appointments</span><strong className="float-right text-emerald-300">{counts.paid}</strong></article><article className="border border-border bg-surface p-4"><span className="text-foreground-muted">Unpaid appointments</span><strong className="float-right text-rose-300">{counts.unpaid}</strong></article><article className="border border-border bg-surface p-4"><span className="text-foreground-muted">Partially paid</span><strong className="float-right text-accent">{counts.partial}</strong></article></div>
    <div className="grid gap-4 border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-5"><AdminSelect label="Date Range" value={range} onChange={(value) => setRange(value as Range)} options={[{value:"today",label:"Today"},{value:"week",label:"This Week"},{value:"month",label:"This Month"},{value:"year",label:"This Year"},{value:"custom",label:"Custom Range"}]}/><AdminSelect label="Payment Method" value={method} onChange={setMethod} options={[{value:"all",label:"All Methods"},...METHOD_OPTIONS]}/><AdminSelect label="Payment Status" value={status} onChange={setStatus} options={[{value:"all",label:"All Statuses"},{value:"completed",label:"Completed"},{value:"pending",label:"Pending"},{value:"failed",label:"Failed"},{value:"voided",label:"Voided"}]}/><AdminSelect label="Service" value={service} onChange={setService} searchable options={[{value:"all",label:"All Services"},...services.map((item)=>({value:item.id,label:item.name}))]}/><AdminSelect label="Transaction" value={type} onChange={setType} options={[{value:"all",label:"All Transactions"},{value:"payment",label:"Payments"},{value:"refund",label:"Refunds"}]}/>{range === "custom" ? <><DateTimePicker mode="date" label="From" value={customStart} onChange={setCustomStart}/><DateTimePicker mode="date" label="To" value={customEnd} onChange={setCustomEnd}/></> : null}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]"><article className="border border-border bg-surface p-5"><div className="flex items-center justify-between"><div><p className="font-admin-primary text-xs uppercase tracking-[.22em] text-foreground-muted">Revenue Trend</p><p className="mt-2 text-sm text-foreground-secondary">Net completed transactions · filtered {formatMoney(net)}</p></div><AdminSelect value={grouping} onChange={setGrouping} options={[{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"monthly",label:"Monthly"}]}/></div><div className="mt-8 flex h-52 items-end gap-2 overflow-x-auto border-b border-border px-2">{chart.length ? chart.map(([label,value])=><div key={label} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2"><span className="text-[9px] text-foreground-muted">{Math.round(value)}</span><div className="w-full max-w-12 bg-accent/80" style={{height:`${Math.max(3,Math.abs(value)/maxChart*150)}px`}}/><span className="pb-2 text-[9px] text-foreground-muted">{label.slice(5)}</span></div>) : <p className="m-auto text-sm text-foreground-muted">No completed transactions in this range.</p>}</div></article><article className="border border-border bg-surface p-5"><p className="font-admin-primary text-xs uppercase tracking-[.22em] text-foreground-muted">Appointment Balances</p><div className="mt-4 max-h-64 space-y-2 overflow-y-auto">{appointments.slice(0,10).map((item)=><div key={item.appointmentId} className="border border-border bg-background/30 p-3"><div className="flex items-center justify-between"><span><b className="block text-sm text-foreground">{item.customerName}</b><small className="text-foreground-muted">{item.bookingReference}</small></span><span className="text-sm text-accent">{formatMoney(Math.max(0,item.amountDue-item.netPaid))}</span></div><div className="mt-3 flex gap-2"><button onClick={()=>setDialog({appointment:item,type:"payment"})} className="min-h-9 flex-1 border border-accent/50 text-[10px] uppercase tracking-[.12em] text-accent">Payment</button><button disabled={item.netPaid<=0} onClick={()=>setDialog({appointment:item,type:"refund"})} className="min-h-9 flex-1 border border-border text-[10px] uppercase tracking-[.12em] text-foreground-secondary disabled:opacity-30">Refund</button></div></div>)}</div></article></div>
    <article className="overflow-hidden border border-border bg-surface">
      <div className="flex flex-col gap-2 border-b border-border p-5 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-admin-display text-2xl uppercase text-foreground">Receipts</h2><p className="mt-1 text-sm text-foreground-muted">Immutable records issued after an appointment is fully settled.</p></div>
        <span className="font-admin-primary text-xs uppercase tracking-[.16em] text-foreground-muted">{receipts.length} issued</span>
      </div>
      <div className="grid gap-3 p-4 md:hidden">
        {receipts.map((receipt) => <article key={receipt.id} className="border border-border bg-background/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-admin-primary text-xs uppercase tracking-[.16em] text-accent">Beleg {receipt.receipt_number}</p><p className="mt-2 text-base text-foreground">{receipt.customer_name ?? "Customer"}</p><p className="mt-1 text-xs text-foreground-muted">{receipt.service_name} · {displayDate(receipt.issued_at)}</p></div><strong className="whitespace-nowrap text-foreground">{formatMoney(receipt.total)}</strong></div><p className="mt-3 text-xs text-foreground-secondary">{receipt.payment_method ? `Payment: ${receipt.payment_method.replaceAll("_", " ")}` : "No payment required"} · {receipt.emailed_at ? "Emailed" : "Not emailed"}</p><ReceiptActions receipt={receipt} emailing={isEmailPending && emailingReceiptId === receipt.id} onEmail={emailReceipt}/></article>)}
        {!receipts.length ? <p className="p-6 text-center text-sm text-foreground-muted">No receipts have been issued yet.</p> : null}
      </div>
      <div className="hidden overflow-x-auto md:block"><table className="min-w-[960px] w-full text-left"><thead className="border-b border-border text-[10px] uppercase tracking-[.16em] text-foreground-muted"><tr>{["Receipt","Issued","Customer","Service","Total","Payment","Email","Actions"].map((head)=><th key={head} className="px-4 py-3 font-normal">{head}</th>)}</tr></thead><tbody>{receipts.map((receipt)=><tr key={receipt.id} className="border-b border-border/70 text-sm text-foreground-secondary"><td className="px-4 py-4 text-accent">BELEG {receipt.receipt_number}</td><td className="px-4 py-4">{displayDate(receipt.issued_at)}</td><td className="px-4 py-4 text-foreground">{receipt.customer_name ?? "Customer"}</td><td className="px-4 py-4">{receipt.service_name}</td><td className="px-4 py-4 text-foreground">{formatMoney(receipt.total)}</td><td className="px-4 py-4 uppercase">{receipt.payment_method?.replaceAll("_", " ") ?? "Not required"}</td><td className="px-4 py-4">{receipt.emailed_at ? <span className="text-emerald-300">Sent</span> : <span className="text-foreground-muted">Not sent</span>}</td><td className="px-4 py-4"><ReceiptActions receipt={receipt} emailing={isEmailPending && emailingReceiptId === receipt.id} onEmail={emailReceipt}/></td></tr>)}</tbody></table>{!receipts.length ? <p className="p-10 text-center text-sm text-foreground-muted">No receipts have been issued yet.</p> : null}</div>
    </article>
    <article className="overflow-hidden border border-border bg-surface"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-admin-display text-2xl uppercase text-foreground">Transactions</h2><p className="mt-1 text-sm text-foreground-muted">{filtered.length} matching records</p></div>{feedback ? <p className="text-sm text-emerald-300">{feedback}</p> : null}</div><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left"><thead className="border-b border-border text-[10px] uppercase tracking-[.16em] text-foreground-muted"><tr>{["Date","Reference","Customer","Service","Type","Amount","Method","Status","Appointment"].map((head)=><th key={head} className="px-4 py-3 font-normal">{head}</th>)}</tr></thead><tbody>{filtered.map((item)=><tr key={item.id} className="border-b border-border/70 text-sm text-foreground-secondary"><td className="px-4 py-4">{displayDate(item.paid_at)}</td><td className="px-4 py-4 text-foreground">{item.booking_reference}</td><td className="px-4 py-4">{item.customer_name}</td><td className="px-4 py-4">{item.service_name}</td><td className="px-4 py-4 uppercase">{item.transaction_type}</td><td className={`px-4 py-4 font-medium ${item.transaction_type === "refund" ? "text-rose-300" : "text-emerald-300"}`}>{item.transaction_type === "refund" ? "−" : "+"}{formatMoney(item.amount)}</td><td className="px-4 py-4 uppercase">{item.payment_method.replace("_"," ")}</td><td className="px-4 py-4 uppercase">{item.status}</td><td className="px-4 py-4 uppercase">{item.appointment_status}</td></tr>)}</tbody></table>{!filtered.length ? <p className="p-10 text-center text-sm text-foreground-muted">No finance transactions match these filters.</p> : null}</div></article>
    {dialog ? <FinanceTransactionDialog appointment={dialog.appointment} promotions={promotions} transactionType={dialog.type} onClose={()=>setDialog(null)} onSuccess={setFeedback}/> : null}
  </section>;
}

const METHOD_OPTIONS = [{value:"cash",label:"Cash"},{value:"twint",label:"TWINT"},{value:"card",label:"Card"},{value:"bank_transfer",label:"Bank Transfer"},{value:"other",label:"Other"}];

function ReceiptActions({ receipt, emailing, onEmail }: { receipt: ReceiptRecord; emailing: boolean; onEmail: (id: string) => void }) {
  const baseUrl = `/api/admin/receipts/${receipt.id}`;
  const actionClass = "inline-flex min-h-9 items-center justify-center gap-1.5 border border-border px-3 font-admin-primary text-[9px] uppercase tracking-[.12em] text-foreground-secondary transition-colors hover:border-accent/60 hover:text-accent";
  return <div className="mt-4 flex flex-wrap gap-2 md:mt-0"><a href={baseUrl} target="_blank" rel="noreferrer" className={actionClass}><Eye size={13}/> View</a><a href={`${baseUrl}?format=print`} target="_blank" rel="noreferrer" className={actionClass}><Printer size={13}/> Print</a><a href={`${baseUrl}?format=pdf`} className={actionClass}><Download size={13}/> PDF</a><button type="button" disabled={emailing} onClick={() => onEmail(receipt.id)} className={`${actionClass} disabled:opacity-40`}><Mail size={13}/> {emailing ? "Sending" : receipt.emailed_at ? "Resend" : "Email"}</button></div>;
}
