"use client";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";


import { formatDateForLocale } from "@/i18n/config";


import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteCustomerAccount, subscribeToMarketingEmails, unsubscribeFromMarketingEmails, updateCustomerAccount } from "@/app/account/actions";
import AccountBookingActions from "@/components/account/AccountBookingActions";
import { createClient } from "@/lib/supabase/client";
import type { CustomerAppointmentSummary } from "@/lib/appointments/types";
import type { CustomerManagementCapabilities } from "@/lib/booking/policy";
import { getMarketingConsentStatus } from "@/lib/customers/marketing-consent";
import type { CustomerRecord } from "@/lib/customers/types";
import type { ReceiptRecord } from "@/lib/receipts/types";
import CustomerLoyaltyView, { LoyaltyOverview } from "@/components/account/CustomerLoyaltyView";
import type { CustomerLoyaltySummary } from "@/lib/loyalty/customer-summary";
import RecurringBookingManager from "@/components/recurring-bookings/RecurringBookingManager";
import type { RecurringBookingRecord } from "@/lib/recurring-bookings/types";

type Tab = "overview" | "appointments" | "loyalty" | "receipts" | "account";
type AppointmentFilter = "upcoming" | "past" | "cancelled";
type Props = {
  customer: Pick<CustomerRecord, "id" | "full_name" | "email" | "phone" | "marketing_email_consent" | "marketing_email_consented_at" | "marketing_email_consent_source" | "marketing_email_unsubscribed_at">;
  pastAppointments: CustomerAppointmentSummary[];
  upcomingAppointments: CustomerAppointmentSummary[];
  bookingDates: { id: string; day: string; date: string; month: string }[];
  bookingCapabilities: Record<string, CustomerManagementCapabilities>;
  receipts: ReceiptRecord[];
  loyalty: CustomerLoyaltySummary;
  services: { id: string; name: string }[];
  recurringBookings: RecurringBookingRecord[];
};

const money = (value: number | null | undefined) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(Number(value ?? 0));
const statusColor = (status: string) => status === "completed" ? "text-emerald-300" : status === "cancelled" || status === "no_show" ? "text-rose-300" : "text-accent";
const tabs: Array<[Tab, string, string]> = [["overview", "Overview", "Overview"], ["appointments", "Appointments", "Bookings"], ["loyalty", "Loyalty", "Loyalty"], ["receipts", "Receipts", "Receipts"], ["account", "Account", "Account"]];

function dateParts(value: string, locale: string = "de") {
  const parts = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: read("day"), month: read("month").toUpperCase(), year: read("year") };
}

function calendarUrl(appointment: CustomerAppointmentSummary) {
  const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({ action: "TEMPLATE", text: `${appointment.service_name} · 1200 Hairstudio`, dates: `${stamp(appointment.start_at)}/${stamp(appointment.end_at)}`, location: "Schulstrasse 2, 8599 Salmsach, Switzerland" });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function CustomerAccountView(props: Props) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  const ui = useTranslations("ui");

  const { customer, pastAppointments, upcomingAppointments, bookingDates, bookingCapabilities, receipts, loyalty, services, recurringBookings } = props;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [appointmentFilter, setAppointmentFilter] = useState<AppointmentFilter>("upcoming");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fullName, setFullName] = useState(customer.full_name);
  const [phone, setPhone] = useState(customer.phone);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preference, setPreference] = useState({ marketing_email_consent: customer.marketing_email_consent, marketing_email_consented_at: customer.marketing_email_consented_at, marketing_email_consent_source: customer.marketing_email_consent_source, marketing_email_unsubscribed_at: customer.marketing_email_unsubscribed_at });
  const [marketingFeedback, setMarketingFeedback] = useState("");
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(false);
  const [isMarketingPending, startMarketingTransition] = useTransition();
  const next = upcomingAppointments[0] ?? null;
  const recentCompleted = pastAppointments.find((appointment) => appointment.status === "completed") ?? null;
  const receiptsByAppointment = useMemo(() => new Map(receipts.map((receipt) => [receipt.appointment_id, receipt])), [receipts]);
  const marketingStatus = getMarketingConsentStatus({ email: customer.email, ...preference });
  const cancelled = pastAppointments.filter((appointment) => appointment.status === "cancelled");
  const nonCancelledPast = pastAppointments.filter((appointment) => appointment.status !== "cancelled");
  const filteredAppointments = appointmentFilter === "upcoming" ? upcomingAppointments : appointmentFilter === "cancelled" ? cancelled : nonCancelledPast;

  function changeTab(nextTab: Tab) { setTab(nextTab); setExpandedId(null); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function saveProfile(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const formData = new FormData(); formData.set("fullName", fullName); formData.set("phone", phone); setFeedback(""); startTransition(async () => { const result = await updateCustomerAccount(formData); if (result.error) return setFeedback(result.error); setEditing(false); setFeedback("Personal details updated."); router.refresh(); }); }
  function updateMarketing(action: "subscribe" | "unsubscribe") { setMarketingFeedback(""); startMarketingTransition(async () => { const result = action === "subscribe" ? await subscribeToMarketingEmails() : await unsubscribeFromMarketingEmails(); if (result.error || !result.preference) return setMarketingFeedback(result.error ?? "Unable to update email preferences."); setPreference(result.preference); setConfirmUnsubscribe(false); setMarketingFeedback(action === "subscribe" ? "You are now subscribed." : "You have been unsubscribed."); router.refresh(); }); }
  async function logout() { setIsLoggingOut(true); await createClient().auth.signOut(); router.push("/login"); router.refresh(); }
  function deleteAccount() { startDeleteTransition(async () => { const result = await deleteCustomerAccount(); if (result.error) return setFeedback(result.error); await createClient().auth.signOut(); router.push("/"); router.refresh(); }); }

  return <div className="min-w-0 pb-20 md:pb-0">
    <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.3em] text-accent">{ui("mb51b2b0d62c7")}</p><h1 className="mt-3 break-words font-display text-3xl font-semibold uppercase leading-none tracking-[-.04em] text-foreground sm:text-5xl">{customer.full_name}</h1></div><Link href="/#booking" className="inline-flex min-h-12 w-full items-center justify-center bg-accent px-6 text-xs uppercase tracking-[.18em] text-background sm:w-auto">{ui("meb7df6f7d7ea")}</Link></header>

    <nav aria-label={ui("m11b4fe2ce156")} className="hidden border-b border-border md:flex">{tabs.map(([value, desktop]) => <button key={value} onClick={() => changeTab(value)} className={`min-h-14 border-b-2 px-5 text-[10px] uppercase tracking-[.18em] ${tab === value ? "border-accent text-accent" : "border-transparent text-foreground-muted hover:text-foreground"}`}>{displayText(desktop)}</button>)}</nav>

    <main className="pt-7 sm:pt-9">
      {tab === "overview" ? <Overview next={next} recent={pastAppointments.slice(0, 3)} recentCompleted={recentCompleted} bookingDates={bookingDates} capabilities={bookingCapabilities} receipts={receiptsByAppointment} loyalty={loyalty} onLoyalty={() => changeTab("loyalty")} onAppointments={() => changeTab("appointments")} /> : null}
      {tab === "appointments" ? <div className="space-y-10"><RecurringBookingManager mode="customer" services={services} series={recurringBookings} /><AppointmentsView filter={appointmentFilter} setFilter={setAppointmentFilter} appointments={filteredAppointments} expandedId={expandedId} setExpandedId={setExpandedId} bookingDates={bookingDates} capabilities={bookingCapabilities} receipts={receiptsByAppointment} /></div> : null}
      {tab === "loyalty" ? <CustomerLoyaltyView summary={loyalty} /> : null}
      {tab === "receipts" ? <ReceiptsView receipts={receipts} /> : null}
      {tab === "account" ? <AccountView customer={customer} fullName={fullName} phone={phone} setFullName={setFullName} setPhone={setPhone} editing={editing} setEditing={setEditing} saveProfile={saveProfile} feedback={feedback} isPending={isPending} marketingStatus={marketingStatus} marketingFeedback={marketingFeedback} isMarketingPending={isMarketingPending} confirmUnsubscribe={confirmUnsubscribe} setConfirmUnsubscribe={setConfirmUnsubscribe} updateMarketing={updateMarketing} logout={logout} isLoggingOut={isLoggingOut} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} deleteAccount={deleteAccount} isDeleting={isDeleting} /> : null}
    </main>

    <nav aria-label={ui("m024320c2a2f7")} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">{tabs.map(([value,, mobile]) => <button key={value} onClick={() => changeTab(value)} className={`min-h-16 px-1 text-[8px] uppercase tracking-[.06em] ${tab === value ? "text-accent" : "text-foreground-muted"}`}>{displayText(mobile)}</button>)}</nav>
  </div>;
}

function Overview({ next, recent, recentCompleted, bookingDates, capabilities, receipts, loyalty, onLoyalty, onAppointments }: { next: CustomerAppointmentSummary | null; recent: CustomerAppointmentSummary[]; recentCompleted: CustomerAppointmentSummary | null; bookingDates: Props["bookingDates"]; capabilities: Props["bookingCapabilities"]; receipts: Map<string, ReceiptRecord>; loyalty: CustomerLoyaltySummary; onLoyalty: () => void; onAppointments: () => void }) {
  const uiText = useUiText();

  const ui = useTranslations("ui");
 return <div className="space-y-8"><section><p className="text-[10px] uppercase tracking-[.28em] text-foreground-muted">{ui("m45b9f9e3d673")}</p>{next ? <NextAppointment appointment={next} dates={bookingDates} capabilities={capabilities[next.id]} /> : <EmptyBooking />}</section><div className="grid border-y border-border sm:grid-cols-3"><Link href="/#booking" className="flex min-h-14 items-center border-b border-border px-4 text-[10px] uppercase tracking-[.15em] text-foreground hover:text-accent sm:border-b-0 sm:border-r">{ui("m360bcaef14cf")}{uiText(recentCompleted ? ` · ${recentCompleted.service_name}` : "")} →</Link><button onClick={onAppointments} className="flex min-h-14 items-center border-b border-border px-4 text-left text-[10px] uppercase tracking-[.15em] text-foreground hover:text-accent sm:border-b-0 sm:border-r">{ui("mb640bb8d91df")}</button><Link href="/#booking" className="flex min-h-14 items-center px-4 text-[10px] uppercase tracking-[.15em] text-foreground hover:text-accent">{ui("mb760fdf0ec31")}</Link></div><LoyaltyOverview summary={loyalty} onView={onLoyalty} /><section><div className="flex items-end justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.28em] text-foreground-muted">{ui("m76eec760c9b6")}</p><h2 className="mt-2 font-display text-2xl uppercase text-foreground sm:text-3xl">{ui("m1f3f4957c553")}</h2></div><button onClick={onAppointments} className="min-h-11 text-[10px] uppercase tracking-[.15em] text-accent">{ui("m5eb9bda4adb4")}</button></div><div className="mt-3 border-t border-border">{recent.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} receipt={receipts.get(appointment.id)} />)}{!recent.length ? <p className="py-8 text-sm text-foreground-muted">{ui("m44a109fbca6f")}</p> : null}</div></section></div>; }

function NextAppointment({ appointment, dates, capabilities }: { appointment: CustomerAppointmentSummary; dates: Props["bookingDates"]; capabilities: CustomerManagementCapabilities }) {
  const locale = useLocale();

  const uiText = useUiText();

  const ui = useTranslations("ui");
 const parts = dateParts(appointment.start_at, locale); return <div className="mt-4 border-y border-border bg-surface/45 py-6 sm:py-8"><div className="grid gap-6 lg:grid-cols-[170px_minmax(0,1fr)_minmax(240px,auto)] lg:items-center"><div className="flex items-end gap-3 lg:block"><span className="font-display text-7xl leading-[.75] tracking-[-.06em] sm:text-8xl">{parts.day}</span><span className="text-xs uppercase tracking-[.24em] text-accent lg:mt-4 lg:block">{parts.month} {parts.year}</span></div><div className="min-w-0"><h2 className="break-words font-display text-3xl uppercase tracking-[-.04em] sm:text-4xl">{appointment.service_name}</h2><p className="mt-3 text-sm text-foreground-secondary">{formatDateForLocale(appointment.start_at, locale)} · {appointment.time_label}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] uppercase tracking-[.15em]"><span className={statusColor(appointment.status)}>{uiText(appointment.status)}</span><span>{money(appointment.final_price)}</span></div><p className="mt-4 text-xs text-foreground-muted">Schulstrasse 2 · 8599 Salmsach</p><div className="mt-3 flex flex-wrap gap-4"><a target="_blank" rel="noreferrer" href={calendarUrl(appointment)} className="inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.14em] text-foreground-secondary">{ui("m6142ba1082a2")}</a><a target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=Schulstrasse+2%2C+8599+Salmsach" className="inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.14em] text-foreground-secondary">{ui("m7496ac62f3f6")}</a></div></div><AccountBookingActions appointmentId={appointment.id} recurringBookingId={appointment.recurring_booking_id} dates={dates} capabilities={capabilities} /></div></div>; }
function EmptyBooking() {
  const ui = useTranslations("ui");
 return <div className="mt-4 border-y border-border py-9"><h2 className="font-display text-3xl uppercase sm:text-4xl">{ui("m2743ec837dfa")}</h2><p className="mt-3 text-sm text-foreground-secondary">{ui("mebfee6ebc904")}</p><Link href="/#booking" className="mt-5 inline-flex min-h-11 items-center text-xs uppercase tracking-[.18em] text-accent">{ui("mb760fdf0ec31")}</Link></div>; }

function AppointmentsView({ filter, setFilter, appointments, expandedId, setExpandedId, bookingDates, capabilities, receipts }: { filter: AppointmentFilter; setFilter: (value: AppointmentFilter) => void; appointments: CustomerAppointmentSummary[]; expandedId: string | null; setExpandedId: (value: string | null) => void; bookingDates: Props["bookingDates"]; capabilities: Props["bookingCapabilities"]; receipts: Map<string, ReceiptRecord> }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  const ui = useTranslations("ui");
 return <section><p className="text-[10px] uppercase tracking-[.28em] text-foreground-muted">{ui("m1f3f4957c553")}</p><h2 className="mt-2 font-display text-3xl uppercase sm:text-4xl">{ui("mef7d64be8019")}</h2><div className="mt-6 flex overflow-x-auto border-b border-border">{(["upcoming", "past", "cancelled"] as const).map((value) => <button key={value} onClick={() => { setFilter(value); setExpandedId(null); }} className={`min-h-12 shrink-0 border-b-2 px-5 text-[10px] uppercase tracking-[.16em] ${filter === value ? "border-accent text-accent" : "border-transparent text-foreground-muted"}`}>{value}</button>)}</div><div className="border-t border-border">{appointments.map((appointment) => { const open = expandedId === appointment.id; return <article key={appointment.id} className="border-b border-border"><button onClick={() => setExpandedId(open ? null : appointment.id)} aria-expanded={open} className="w-full"><AppointmentRow appointment={appointment} receipt={receipts.get(appointment.id)} /></button>{open ? <AppointmentDetails appointment={appointment} receipt={receipts.get(appointment.id)}>{appointment.status === "confirmed" ? <AccountBookingActions appointmentId={appointment.id} recurringBookingId={appointment.recurring_booking_id} dates={bookingDates} capabilities={capabilities[appointment.id]} /> : null}</AppointmentDetails> : null}</article>; })}{!appointments.length ? <p className="py-10 text-sm text-foreground-muted">{ui("m816c52fd2bdd")}{" "}{displayText(filter)} {" "}{ui("m701d2993152a")}</p> : null}</div></section>; }
function AppointmentRow({ appointment, receipt }: { appointment: CustomerAppointmentSummary; receipt?: ReceiptRecord }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  const locale = useLocale();
 return <div className="grid min-h-16 min-w-0 gap-2 py-4 text-left sm:grid-cols-[150px_minmax(0,1fr)_140px_110px_30px] sm:items-center"><span className="text-xs uppercase tracking-[.12em] text-foreground-secondary">{formatDateForLocale(appointment.start_at, locale)}</span><span className="break-words text-sm uppercase">{appointment.service_name}</span><span className="text-xs text-foreground-muted">{appointment.time_label}</span><span className={`text-[10px] uppercase tracking-[.14em] ${statusColor(appointment.status)}`}>{displayText(appointment.status.replaceAll("_", " "))}</span><span className="hidden text-right text-accent sm:block">{receipt ? "↗" : "→"}</span></div>; }
function AppointmentDetails({ appointment, receipt, children }: { appointment: CustomerAppointmentSummary; receipt?: ReceiptRecord; children?: React.ReactNode }) {
  const ui = useTranslations("ui");
 return <div className="grid gap-5 bg-surface/50 px-4 py-5 sm:grid-cols-2"><dl><Detail label={ui("m9086c078dadb")} value={appointment.booking_reference ?? "—"} /><Detail label={ui("me7491672e0c0")} value={money(appointment.original_price)} /><Detail label={ui("mb524936d7aa1")} value={money(appointment.discount_amount)} /><Detail label={ui("mad27497784c8")} value={money(appointment.final_price)} /></dl><div>{children}{appointment.status === "completed" ? <Link href="/#booking" className="inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.16em] text-accent">{ui("m6196555ce2df")}</Link> : null}{receipt ? <div className="flex flex-wrap gap-4"><ReceiptLinks receipt={receipt} /></div> : null}</div></div>; }

function ReceiptsView({ receipts }: { receipts: ReceiptRecord[] }) {
  const uiText = useUiText();
  const locale = useLocale();

  const ui = useTranslations("ui");
 return <section><p className="text-[10px] uppercase tracking-[.28em] text-foreground-muted">{ui("md6dadec06672")}</p><h2 className="mt-2 font-display text-3xl uppercase sm:text-4xl">{ui("mee397771d5f7")}</h2><div className="mt-6 divide-y divide-border border-y border-border">{receipts.map((receipt) => <div key={receipt.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm uppercase">{uiText("Receipt")} {receipt.receipt_number}</p><p className="mt-1 text-xs text-foreground-muted">{receipt.service_name} · {new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", dateStyle: "medium" }).format(new Date(receipt.issued_at))} · {money(receipt.total)}</p></div><div className="flex flex-wrap gap-4"><ReceiptLinks receipt={receipt} /></div></div>)}{!receipts.length ? <p className="py-10 text-sm text-foreground-muted">{ui("m498eb5302739")}</p> : null}</div></section>; }
function ReceiptLinks({ receipt }: { receipt: ReceiptRecord }) {
  const ui = useTranslations("ui");
 return <><a target="_blank" rel="noreferrer" href={`/api/account/receipts/${receipt.id}`} className="inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.15em] text-accent">{ui("mc4041c252106")}</a><a href={`/api/account/receipts/${receipt.id}?download=1`} className="inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.15em] text-foreground-secondary">{ui("mbe0b210a2eaa")}</a></>; }

type AccountViewProps = { customer: Props["customer"]; fullName: string; phone: string; setFullName: (value: string) => void; setPhone: (value: string) => void; editing: boolean; setEditing: (value: boolean) => void; saveProfile: (event: React.FormEvent<HTMLFormElement>) => void; feedback: string; isPending: boolean; marketingStatus: string; marketingFeedback: string; isMarketingPending: boolean; confirmUnsubscribe: boolean; setConfirmUnsubscribe: (value: boolean) => void; updateMarketing: (action: "subscribe" | "unsubscribe") => void; logout: () => void; isLoggingOut: boolean; confirmDelete: boolean; setConfirmDelete: (value: boolean) => void; deleteAccount: () => void; isDeleting: boolean };
function AccountView(props: AccountViewProps) {
  const uiText = useUiText();

  const ui = useTranslations("ui");
 return <div className="space-y-10"><section><div className="flex items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.26em] text-foreground-muted">{ui("m85dfa32c97d8")}</p><h2 className="mt-2 font-display text-3xl uppercase">{ui("m1aec6cffe9f1")}</h2></div><button onClick={() => props.setEditing(!props.editing)} className="min-h-11 text-[10px] uppercase tracking-[.17em] text-accent">{uiText(props.editing ? "Cancel" : "Edit →")}</button></div>{props.editing ? <form onSubmit={props.saveProfile} className="mt-5 grid gap-4 md:grid-cols-2"><Field label={ui("meeb692087d62")} value={props.fullName} onChange={props.setFullName} required /><Field label={ui("m84add5b29527")} value={props.customer.email} disabled /><Field label={ui("m77064d526523")} value={props.phone} onChange={props.setPhone} /><button disabled={props.isPending} className="min-h-12 bg-accent px-5 text-[10px] uppercase tracking-[.16em] text-background disabled:opacity-50">{uiText(props.isPending ? "Saving…" : "Save Changes")}</button></form> : <dl className="mt-5 divide-y divide-border border-y border-border"><Detail label={ui("meeb692087d62")} value={props.customer.full_name} /><Detail label={ui("m84add5b29527")} value={props.customer.email} /><Detail label={ui("m77064d526523")} value={props.customer.phone || "Not provided"} /></dl>}{props.feedback ? <p className="mt-3 text-sm text-foreground-secondary">{uiText(props.feedback)}</p> : null}</section><section className="border-t border-border pt-7"><p className="text-[10px] uppercase tracking-[.26em] text-foreground-muted">{ui("made0d50c9254")}</p><div className="mt-4 flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm uppercase">{ui("m14c0251e50a8")}</p><p className="mt-1 text-xs text-foreground-muted">{uiText(props.marketingStatus === "subscribed" ? "Subscribed" : "Not subscribed")}{ui("mbb901d008c09")}</p></div>{props.marketingStatus === "subscribed" ? <button disabled={props.isMarketingPending} onClick={() => props.setConfirmUnsubscribe(true)} className="min-h-11 w-fit border border-border px-4 text-[10px] uppercase tracking-[.15em]">{ui("m834cc0ee6089")}</button> : <button disabled={props.isMarketingPending} onClick={() => props.updateMarketing("subscribe")} className="min-h-11 w-fit bg-accent px-4 text-[10px] uppercase tracking-[.15em] text-background">{ui("md6981f74767d")}</button>}</div>{props.confirmUnsubscribe ? <div className="mt-4 border border-border p-4"><p className="text-sm leading-6 text-foreground-secondary">{ui("m04f067c4f6b9")}</p><div className="mt-3 flex flex-wrap gap-3"><button disabled={props.isMarketingPending} onClick={() => props.updateMarketing("unsubscribe")} className="min-h-11 bg-foreground px-4 text-[10px] uppercase text-background">{ui("m04a212215ef9")}</button><button onClick={() => props.setConfirmUnsubscribe(false)} className="min-h-11 border border-border px-4 text-[10px] uppercase">{ui("mc8974fd1abc3")}</button></div></div> : null}{props.marketingFeedback ? <p className="mt-3 text-sm text-foreground-secondary">{uiText(props.marketingFeedback)}</p> : null}</section><section className="border-t border-border pt-7"><p className="text-[10px] uppercase tracking-[.26em] text-foreground-muted">{ui("mf25ce1b8a399")}</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Link href="/forgot-password" className="inline-flex min-h-11 items-center justify-center border border-border px-5 text-[10px] uppercase tracking-[.16em]">{ui("m49289db43e66")}</Link><button onClick={props.logout} disabled={props.isLoggingOut} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground-secondary">{uiText(props.isLoggingOut ? "Signing Out…" : "Logout")}</button></div></section><section className="border-t border-rose-900/50 pt-7"><p className="text-[10px] uppercase tracking-[.26em] text-rose-300">{ui("m8fc83aac976c")}</p>{props.confirmDelete ? <div className="mt-4 border border-rose-900/50 p-4"><p className="text-sm leading-6 text-foreground-secondary">{ui("m98abaa65d3f0")}</p><div className="mt-3 flex flex-col gap-3 sm:flex-row"><button disabled={props.isDeleting} onClick={props.deleteAccount} className="min-h-11 bg-rose-900 px-5 text-[10px] uppercase tracking-[.15em] text-white">{uiText(props.isDeleting ? "Deleting…" : "Delete Permanently")}</button><button onClick={() => props.setConfirmDelete(false)} className="min-h-11 border border-border px-5 text-[10px] uppercase">{ui("m77dfd2135f4d")}</button></div></div> : <button onClick={() => props.setConfirmDelete(true)} className="mt-4 min-h-11 text-[10px] uppercase tracking-[.16em] text-rose-300">{ui("m65ec79b71d86")}</button>}</section></div>; }
function Detail({ label, value }: { label: string; value: string }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);
 return <div className="flex min-w-0 items-start justify-between gap-4 py-3"><dt className="text-[10px] uppercase tracking-[.14em] text-foreground-muted">{displayText(label)}</dt><dd className="min-w-0 break-words text-right text-sm">{value}</dd></div>; }
function Field({ label, value, onChange, required, disabled }: { label: string; value: string; onChange?: (value: string) => void; required?: boolean; disabled?: boolean }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);
 return <label><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{displayText(label)}</span><input value={value} onChange={(event) => onChange?.(event.target.value)} required={required} disabled={disabled} className="mt-2 min-h-12 w-full border border-border bg-transparent px-4 text-base outline-none focus:border-accent disabled:text-foreground-muted" /></label>; }
