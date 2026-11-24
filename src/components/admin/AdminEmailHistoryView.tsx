"use client";
import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import AdminSelect from "@/components/admin/AdminSelect";
import type { AdminEmailHistoryRow, EmailHistoryStatusFilter, EmailHistoryTypeFilter } from "@/lib/customers/email-logs";

type Props = {
  rows: AdminEmailHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: { search: string; customerId: string; type: EmailHistoryTypeFilter; status: EmailHistoryStatusFilter };
};

const typeOptions = [
  { value: "all", label: "All email types" },
  { value: "appointment_confirmation", label: "Appointment Confirmation" },
  { value: "appointment_rescheduled", label: "Appointment Rescheduled" },
  { value: "appointment_cancelled", label: "Appointment Cancelled" },
  { value: "appointment_reminder", label: "Appointment Reminder" },
  { value: "regular_booking", label: "Regular Booking" },
  { value: "receipt", label: "Receipt" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Other" },
];
const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "processing", label: "Processing" },
  { value: "skipped", label: "Skipped" },
];

function displayDate(value: string | null, locale: string = "de") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function displayType(value: string) { return value.replaceAll("_", " "); }
function statusClass(status: string) {
  if (status === "sent") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "failed") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  if (status === "skipped") return "border-border bg-background text-foreground-muted";
  return "border-amber-500/30 bg-amber-500/10 text-amber-200";
}

export default function AdminEmailHistoryView({ rows, total, page, pageSize, filters }: Props) {
  const locale = useLocale();

  const uiText = useUiText();

  const ui = useTranslations("ui");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search);
  const [selected, setSelected] = useState<AdminEmailHistoryRow | null>(null);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);

  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [selected]);

  function navigate(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) value ? params.set(key, value) : params.delete(key);
    if (!("page" in changes)) params.delete("page");
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  const hasFilters = Boolean(filters.search || filters.customerId || filters.type !== "all" || filters.status !== "all");
  return <section className="space-y-6">
    <div className="border border-border bg-surface p-4 sm:p-5">
      <form onSubmit={(event) => { event.preventDefault(); navigate({ search: search.trim() || null }); }} className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_240px_200px_auto] lg:items-end">
        <label className="space-y-2"><span className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">{ui("mbce06414177f")}</span><span className="flex min-h-12 items-center gap-3 border border-border bg-background px-4 focus-within:border-accent"><Search size={15} className="text-foreground-muted"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui("mc95d0b006cfd")} className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none sm:text-sm"/></span></label>
        <AdminSelect label={ui("m8e76e04e4fb1")} value={filters.type} onChange={(value) => navigate({ type: value === "all" ? null : value })} options={typeOptions}/>
        <AdminSelect label={ui("mbae7d5be7082")} value={filters.status} onChange={(value) => navigate({ status: value === "all" ? null : value })} options={statusOptions}/>
        <div className="flex gap-2"><button type="submit" className="min-h-12 flex-1 bg-accent px-5 text-[10px] font-semibold uppercase tracking-[.16em] text-background lg:flex-none">{ui("mbce06414177f")}</button>{hasFilters ? <button type="button" onClick={() => { setSearch(""); router.push(pathname); }} className="min-h-12 border border-border px-4 text-[10px] uppercase tracking-[.14em] text-foreground-secondary hover:text-accent">{ui("m5be6985613b3")}</button> : null}</div>
      </form>
      {filters.customerId ? <div className="mt-3 text-[10px] uppercase tracking-[.14em] text-foreground-muted">{ui("m984adf3227a3")}{" "}<button type="button" onClick={() => navigate({ customer: null })} className="text-accent">{ui("mdb99845855b2")}</button></div> : null}
    </div>

    <div className="border border-border bg-surface">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">{ui("mb1b1939bdee1")}</p><p className="text-xs text-foreground-muted">{ui("m163d8174ff4b")}{" "}{first}–{last} {" "}{ui("mde04fa0e29f9")}{" "}{total}</p></div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-left"><thead><tr className="text-[10px] uppercase tracking-[.14em] text-foreground-muted">{["Date & Time","Customer","Recipient","Type / Subject","Status","Appointment",""].map((label) => <th key={label} className="px-4 py-3 font-normal">{uiText(label)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border/70 text-sm text-foreground-secondary hover:bg-background/30"><td className="whitespace-nowrap px-4 py-4">{displayDate(row.created_at, locale)}</td><td className="px-4 py-4 text-foreground">{row.customer_name || "—"}</td><td className="max-w-56 break-all px-4 py-4">{row.recipient_email}</td><td className="max-w-sm px-4 py-4"><p className="text-[9px] uppercase tracking-[.14em] text-accent">{uiText(displayType(row.email_type))}</p><p className="mt-1 break-words text-foreground">{row.subject}</p></td><td className="px-4 py-4"><span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[.12em] ${statusClass(row.status)}`}>{uiText(row.status)}</span></td><td className="px-4 py-4">{row.appointment_id ? <Link href={`/admin/appointments?appointmentId=${encodeURIComponent(row.appointment_id)}`} className="text-accent">{ui("mcf3dbdab782e")}</Link> : "—"}</td><td className="px-4 py-4"><button type="button" onClick={() => setSelected(row)} className="min-h-10 border border-border px-3 text-[9px] uppercase tracking-[.14em] hover:text-accent">{ui("mdc3decbb9384")}</button></td></tr>)}</tbody></table></div>
      <div className="divide-y divide-border md:hidden">{rows.map((row) => <button key={row.id} type="button" onClick={() => setSelected(row)} className="block w-full min-w-0 p-4 text-left hover:bg-background/30"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] uppercase tracking-[.14em] text-foreground-muted">{displayDate(row.created_at, locale)}</p><p className="mt-2 break-words text-sm text-foreground">{row.customer_name || row.recipient_email}</p></div><span className={`shrink-0 border px-2 py-1 text-[9px] uppercase ${statusClass(row.status)}`}>{uiText(row.status)}</span></div><p className="mt-3 text-[9px] uppercase tracking-[.14em] text-accent">{uiText(displayType(row.email_type))}</p><p className="mt-1 break-words text-sm text-foreground-secondary">{row.subject}</p><p className="mt-2 break-all text-xs text-foreground-muted">{row.recipient_email}</p></button>)}</div>
      {!rows.length ? <div className="px-5 py-16 text-center"><p className="font-admin-display text-2xl uppercase text-foreground">{uiText(hasFilters ? "No Results" : "No Email History")}</p><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-foreground-muted">{uiText(hasFilters ? "No emails match your current search or filters." : "No customer emails have been recorded yet.")}</p></div> : null}
      {total > pageSize ? <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-foreground-muted">{ui("mfb06270f7c21")}{" "}{page} {" "}{ui("mde04fa0e29f9")}{" "}{pageCount}</p><div className="flex gap-2"><Link aria-disabled={page <= 1} href={page <= 1 ? "#" : `${pathname}?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: String(page - 1) })}`} className={`inline-flex min-h-11 items-center gap-2 border border-border px-4 text-[10px] uppercase tracking-[.14em] ${page <= 1 ? "pointer-events-none opacity-35" : "hover:text-accent"}`}><ChevronLeft size={14}/>{ui("m50f94286ba30")}</Link><Link aria-disabled={page >= pageCount} href={page >= pageCount ? "#" : `${pathname}?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: String(page + 1) })}`} className={`inline-flex min-h-11 items-center gap-2 border border-border px-4 text-[10px] uppercase tracking-[.14em] ${page >= pageCount ? "pointer-events-none opacity-35" : "hover:text-accent"}`}>{ui("mbc981983e7f5")}<ChevronRight size={14}/></Link></div></div> : null}
    </div>

    {selected ? <div className="fixed inset-0 z-[100] flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"><button type="button" className="absolute inset-0" aria-label={ui("m71ecfd7a76a3")} onClick={() => setSelected(null)}/><section role="dialog" aria-modal="true" aria-label={ui("mf9c3a37cc2c2")} className="relative z-10 max-h-[calc(100dvh-24px)] w-full overflow-y-auto border border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:max-w-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.2em] text-accent">{uiText(displayType(selected.email_type))}</p><h2 className="mt-2 break-words font-admin-display text-2xl uppercase text-foreground">{ui("md6a146559721")}</h2></div><button type="button" onClick={() => setSelected(null)} className="inline-flex size-11 shrink-0 items-center justify-center border border-border" aria-label={ui("mbbfa773e5a63")}><X size={16}/></button></div><dl className="mt-6 divide-y divide-border border-y border-border">{[["Customer",selected.customer_name || "—"],["Recipient",selected.recipient_email],["Subject",selected.subject],["Status",selected.status],["Created",displayDate(selected.created_at, locale)],["Sent",displayDate(selected.sent_at, locale)],["Failed",displayDate(selected.failed_at, locale)],["Provider Message ID",selected.provider_message_id || "—"]].map(([label,value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]"><dt className="text-[9px] uppercase tracking-[.14em] text-foreground-muted">{uiText(label)}</dt><dd className="break-all text-sm text-foreground-secondary">{value}</dd></div>)}</dl>{selected.appointment_id ? <Link href={`/admin/appointments?appointmentId=${encodeURIComponent(selected.appointment_id)}`} className="mt-5 inline-flex min-h-11 items-center border border-accent/50 px-4 text-[10px] uppercase tracking-[.14em] text-accent">{ui("m813f4e4493c7")}</Link> : null}{selected.error_message ? <div className="mt-5 border border-rose-500/30 bg-rose-500/10 p-4"><p className="text-[9px] uppercase tracking-[.14em] text-rose-200">{ui("me0e3366664e5")}</p><p className="mt-2 break-words text-sm text-rose-100">{selected.error_message}</p></div> : null}{selected.metadata && Object.keys(selected.metadata).length ? <div className="mt-5"><p className="text-[9px] uppercase tracking-[.14em] text-foreground-muted">{ui("m251edc0eb5a8")}</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words border border-border bg-background p-4 text-xs text-foreground-secondary">{JSON.stringify(selected.metadata, null, 2)}</pre></div> : null}</section></div> : null}
  </section>;
}
