"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import {
  closeRegister,
  openRegister,
  recordRegisterMovement,
} from "@/app/actions/register";
import type {
  RegisterPageData,
  RegisterSessionDetail,
} from "@/lib/register/types";
import type { PaymentMethodSetting } from "@/lib/admin/settings";
import { displayDate, formatMoney } from "@/components/admin/finance/shared";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";

const METHOD_LABELS: Record<PaymentMethodSetting, string> = {
  cash: "Cash",
  twint: "TWINT",
  card: "Card",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

type DialogState =
  | { type: "open"; previous: RegisterSessionDetail | null }
  | { type: "deposit" | "withdrawal"; session: RegisterSessionDetail }
  | { type: "close"; session: RegisterSessionDetail }
  | { type: "view"; session: RegisterSessionDetail }
  | null;

const DENOMINATIONS = [
  { label: "CHF 1000", cents: 100000, group: "Notes" }, { label: "CHF 200", cents: 20000, group: "Notes" },
  { label: "CHF 100", cents: 10000, group: "Notes" }, { label: "CHF 50", cents: 5000, group: "Notes" },
  { label: "CHF 20", cents: 2000, group: "Notes" }, { label: "CHF 10", cents: 1000, group: "Notes" },
  { label: "CHF 5", cents: 500, group: "Coins" }, { label: "CHF 2", cents: 200, group: "Coins" },
  { label: "CHF 1", cents: 100, group: "Coins" }, { label: "CHF 0.50", cents: 50, group: "Coins" },
  { label: "CHF 0.20", cents: 20, group: "Coins" }, { label: "CHF 0.10", cents: 10, group: "Coins" },
  { label: "CHF 0.05", cents: 5, group: "Coins" },
] as const;

function reconciliationStatus(difference: number) {
  return difference < 0 ? "SHORT" : difference > 0 ? "OVER" : "BALANCED";
}

function localDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
  }).format(new Date(value));
}

function localTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AmountRow({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-foreground-secondary">{label}</span>
      <span className={negative && value ? "text-rose-300" : "text-foreground"}>
        {negative && value ? "−" : ""}{formatMoney(value)}
      </span>
    </div>
  );
}

function RegisterOverview({ detail }: { detail: RegisterSessionDetail }) {
  const { breakdown } = detail;
  return (
    <div className="space-y-5">
      <section className="border border-border bg-background/30 p-4 sm:p-5">
        <h3 className="font-admin-display text-xl uppercase text-foreground">Cash</h3>
        <div className="mt-3 divide-y divide-border/60">
          <AmountRow label="Opening amount" value={breakdown.openingCash} />
          <AmountRow label="Cash payments" value={breakdown.cashPayments} />
          {breakdown.cashTips ? <AmountRow label="Cash tips" value={breakdown.cashTips} /> : null}
          <AmountRow label="Deposits" value={breakdown.deposits} />
          <AmountRow label="Withdrawals" value={breakdown.withdrawals} negative />
          <AmountRow label="Cash refunds" value={breakdown.cashRefunds} negative />
        </div>
      </section>
      {breakdown.paymentMethods.filter((item) => item.method !== "cash").map((item) => (
        <section key={item.method} className="border border-border bg-background/30 p-4 sm:p-5">
          <h3 className="font-admin-display text-xl uppercase text-foreground">{METHOD_LABELS[item.method]}</h3>
          <div className="mt-3 divide-y divide-border/60">
            <AmountRow label="Payments" value={item.payments} />
            {item.tips ? <AmountRow label="Tips" value={item.tips} /> : null}
            {item.refunds ? <AmountRow label="Refunds" value={item.refunds} negative /> : null}
          </div>
        </section>
      ))}
      <div className="flex items-end justify-between gap-4 border-t border-accent/40 pt-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-foreground-muted">Expected physical cash</p>
          <p className="mt-2 font-admin-display text-3xl text-accent">{formatMoney(detail.expectedCash)}</p>
        </div>
        {detail.session.status === "closed" ? (
          <div className="text-right text-xs text-foreground-secondary">
            <p>Actual {formatMoney(detail.session.actual_cash ?? 0)}</p>
            <p className={(detail.session.difference ?? 0) < 0 ? "mt-1 text-rose-300" : "mt-1 text-foreground"}>
              Difference {formatMoney(detail.session.difference ?? 0)}
            </p>
          </div>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-foreground-muted">Opening cash and register movements affect the drawer only. They are not business revenue.</p>
    </div>
  );
}

function RegisterActivity({ detail }: { detail: RegisterSessionDetail }) {
  return (
    <div className="divide-y divide-border">
      {detail.activity.map((item) => (
        <article key={item.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-3 py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
          <time className="text-xs text-foreground-muted">{localTime(item.at)}</time>
          <div className="min-w-0">
            <p className="text-sm text-foreground">{item.title}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-foreground-muted">
              {item.kind === "opened" || item.kind === "closed" ? item.kind : item.paymentMethod ? METHOD_LABELS[item.paymentMethod] : item.kind}
            </p>
            {item.description ? <p className="mt-2 break-words text-xs leading-5 text-foreground-secondary">“{item.description}”</p> : null}
            {item.customerName ? <p className="mt-2 text-xs text-foreground-secondary">Customer · {item.customerName}</p> : null}
            {item.appointmentAt ? <p className="mt-1 text-xs text-foreground-muted">Appointment · {displayDate(item.appointmentAt)}</p> : null}
            {item.adminLabel ? <p className="mt-1 text-xs text-foreground-muted">{item.adminLabel}</p> : null}
            {item.kind === "closed" ? <p className="mt-2 text-xs leading-5 text-foreground-secondary">Expected {formatMoney(item.expectedCash ?? 0)} · Counted {formatMoney(item.actualCash ?? 0)} · {reconciliationStatus(item.difference ?? 0)} {formatMoney(item.difference ?? 0)}</p> : null}
            {item.appointmentId ? <Link href={`/admin/appointments?appointmentId=${encodeURIComponent(item.appointmentId)}`} className="mt-2 inline-flex min-h-10 items-center text-[10px] uppercase tracking-[0.14em] text-accent">View Appointment →</Link> : null}
          </div>
          <span className={`whitespace-nowrap text-sm ${item.amount != null && item.amount < 0 ? "text-rose-300" : "text-foreground"}`}>
            {item.amount == null ? "" : `${item.amount > 0 ? "+" : item.amount < 0 ? "−" : ""}${formatMoney(Math.abs(item.amount))}`}
          </span>
        </article>
      ))}
    </div>
  );
}

function DetailView({ detail }: { detail: RegisterSessionDetail }) {
  const [tab, setTab] = useState<"overview" | "activity" | "report">("overview");
  return (
    <>
      <div className={`grid ${detail.session.status === "closed" ? "grid-cols-3" : "grid-cols-2"} border border-border bg-background p-1`}>
        {(["overview", "activity", ...(detail.session.status === "closed" ? ["report" as const] : [])] as const).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`min-h-11 px-4 text-[10px] uppercase tracking-[0.18em] ${tab === item ? "bg-accent text-background" : "text-foreground-secondary"}`}>{item}</button>
        ))}
      </div>
      <div className="mt-5">{tab === "overview" ? <RegisterOverview detail={detail} /> : tab === "activity" ? <RegisterActivity detail={detail} /> : <div className="grid gap-3 sm:grid-cols-3"><a href={`/api/admin/register-sessions/${detail.session.id}/report`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">View Report</a><a href={`/api/admin/register-sessions/${detail.session.id}/report?format=pdf`} className="inline-flex min-h-11 items-center justify-center border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">Download PDF</a><a href={`/api/admin/register-sessions/${detail.session.id}/report?format=print`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center border border-accent/60 px-4 text-xs uppercase tracking-[0.14em] text-accent">Print</a></div>}</div>
    </>
  );
}

function RegisterDialog({ dialog, onClose }: { dialog: Exclude<DialogState, null>; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState(dialog.type === "close" ? dialog.session.expectedCash.toFixed(2) : dialog.type === "open" ? "0.00" : "");
  const [note, setNote] = useState("");
  const [countMode, setCountMode] = useState<"manual" | "denominations">("manual");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const denominationCents = DENOMINATIONS.reduce((sum, denomination) => sum + denomination.cents * (quantities[denomination.cents] ?? 0), 0);
  const numericAmount = dialog.type === "close" && countMode === "denominations" ? denominationCents / 100 : Number(amount.replace(",", "."));
  const difference = dialog.type === "close" && Number.isFinite(numericAmount)
    ? (Math.round(numericAmount * 100) - Math.round(dialog.session.expectedCash * 100)) / 100
    : 0;
  const title = dialog.type === "open" ? "Open Register" : dialog.type === "close" ? "Close Register" : dialog.type === "view" ? `${dialog.session.session.status} Register` : dialog.type === "deposit" ? "Deposit" : "Withdrawal";

  function submit() {
    if (dialog.type === "view") return;
    startTransition(async () => {
      setFeedback("");
      const result = dialog.type === "open"
        ? await openRegister({ openingCash: amount, note })
        : dialog.type === "close"
          ? await closeRegister({ sessionId: dialog.session.session.id, actualCash: numericAmount.toFixed(2), note })
          : await recordRegisterMovement({ sessionId: dialog.session.session.id, type: dialog.type, amount, note });
      if (result.error) { setFeedback(result.error); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
      <div className="max-h-[calc(100dvh-24px)] w-full max-w-2xl overflow-y-auto border border-border bg-surface shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface p-4 sm:p-6">
          <div><p className="text-[10px] uppercase tracking-[0.2em] text-accent">Cash Register</p><h2 className="mt-2 font-admin-display text-2xl uppercase text-foreground sm:text-3xl">{title}</h2></div>
          <button type="button" onClick={onClose} disabled={pending} className="inline-flex size-11 items-center justify-center border border-border text-foreground-secondary" aria-label="Close dialog"><X size={17} /></button>
        </header>
        <div className="p-4 sm:p-6">
          {dialog.type === "view" ? <DetailView detail={dialog.session} /> : (
            <div className="space-y-5">
              {dialog.type === "close" ? <RegisterOverview detail={dialog.session} /> : null}
              {dialog.type === "open" && dialog.previous ? <div className="border border-border bg-background/30 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Previous register</p><p className="mt-2 text-sm text-foreground-secondary">Closed {displayDate(dialog.previous.session.closed_at ?? dialog.previous.session.opened_at)}</p><p className="mt-1 text-sm text-foreground">Previous counted cash · {formatMoney(dialog.previous.session.actual_cash ?? 0)}</p><p className="mt-2 text-xs leading-5 text-foreground-muted">Enter the new opening balance explicitly. Previous counted cash is context only and is not carried forward automatically.</p></div> : null}
              {dialog.type === "close" ? <div className="grid grid-cols-2 border border-border bg-background p-1"><button type="button" onClick={() => setCountMode("manual")} className={`min-h-11 px-3 text-[10px] uppercase tracking-[0.14em] ${countMode === "manual" ? "bg-accent text-background" : "text-foreground-secondary"}`}>Manual Total</button><button type="button" onClick={() => setCountMode("denominations")} className={`min-h-11 px-3 text-[10px] uppercase tracking-[0.14em] ${countMode === "denominations" ? "bg-accent text-background" : "text-foreground-secondary"}`}>Cash Count</button></div> : null}
              {dialog.type !== "close" || countMode === "manual" ? <label className="block"><span className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{dialog.type === "open" ? "Opening cash" : dialog.type === "close" ? "Actual cash counted" : "Amount"} (CHF)</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" className="mt-2 min-h-12 w-full border border-border bg-background px-4 text-foreground outline-none focus:border-accent" /></label> : <div className="space-y-5 border border-border bg-background/30 p-4"><p className="text-[10px] uppercase tracking-[0.2em] text-accent">Cash Count</p>{(["Notes","Coins"] as const).map((group) => <section key={group}><h3 className="text-xs uppercase tracking-[0.16em] text-foreground-muted">{group}</h3><div className="mt-2 divide-y divide-border/60">{DENOMINATIONS.filter((item) => item.group === group).map((item) => { const quantity = quantities[item.cents] ?? 0; return <div key={item.cents} className="grid grid-cols-[5rem_5rem_minmax(0,1fr)] items-center gap-3 py-2"><span className="text-xs text-foreground-secondary">{item.label}</span><input type="number" min="0" step="1" value={quantity || ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.cents]: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))} aria-label={`${item.label} quantity`} className="min-h-10 w-full border border-border bg-surface px-3 text-center text-sm text-foreground outline-none focus:border-accent" /><span className="text-right text-xs text-foreground">{formatMoney(item.cents * quantity / 100)}</span></div>; })}</div></section>)}<div className="flex justify-between border-t border-accent/40 pt-4"><span className="text-xs uppercase tracking-[0.16em] text-foreground-muted">Total</span><strong className="text-lg text-accent">{formatMoney(denominationCents / 100)}</strong></div></div>}
              {dialog.type === "close" ? <div className="grid grid-cols-3 gap-2 border border-border bg-background/30 p-4 text-xs sm:gap-4"><div><span className="text-foreground-muted">Expected</span><strong className="mt-1 block text-foreground">{formatMoney(dialog.session.expectedCash)}</strong></div><div><span className="text-foreground-muted">Counted</span><strong className="mt-1 block text-foreground">{Number.isFinite(numericAmount) ? formatMoney(numericAmount) : "—"}</strong></div><div><span className="text-foreground-muted">{reconciliationStatus(difference)}</span><strong className={`mt-1 block ${difference < 0 ? "text-rose-300" : "text-accent"}`}>{formatMoney(difference)}</strong></div></div> : null}
              <label className="block"><span className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{dialog.type === "close" ? difference !== 0 ? "Discrepancy reason *" : "Closing note (Optional)" : dialog.type === "open" ? "Opening note (Optional)" : "Note / reason (Optional)"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full resize-y border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-accent" /></label>
              {feedback ? <p className="text-sm text-rose-300">{feedback}</p> : null}
            </div>
          )}
        </div>
        {dialog.type !== "view" ? <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:flex-row sm:justify-end sm:p-5"><button type="button" onClick={onClose} disabled={pending} className="min-h-11 border border-border px-5 text-xs uppercase tracking-[0.16em] text-foreground-secondary">Cancel</button><button type="button" onClick={submit} disabled={pending || !Number.isFinite(numericAmount) || (dialog.type === "close" && difference !== 0 && !note.trim())} className="min-h-11 bg-accent px-5 text-xs uppercase tracking-[0.16em] text-background disabled:opacity-50">{pending ? "Saving…" : title}</button></footer> : null}
      </div>
    </div>
  );
}

export default function RegisterManager({ data }: { data: RegisterPageData }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | "balanced" | "discrepancy">("all");
  const [historyAdmin, setHistoryAdmin] = useState("");
  const current = data.current;
  const history = useMemo(() => data.history.filter((detail) => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(detail.session.opened_at));
    if (historyFrom && date < historyFrom) return false;
    if (historyTo && date > historyTo) return false;
    if (historyAdmin && !detail.openedByLabel.toLowerCase().includes(historyAdmin.toLowerCase())) return false;
    const discrepancy = (detail.session.difference ?? 0) !== 0;
    return historyStatus === "all" || (historyStatus === "discrepancy" ? discrepancy : !discrepancy);
  }), [data.history, historyAdmin, historyFrom, historyStatus, historyTo]);

  return (
    <div className="space-y-8">
      <section className="border border-border bg-surface">
        <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div><p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Current Register</p><h2 className="mt-2 font-admin-display text-3xl uppercase text-foreground">{current ? "Register Open" : "Register is closed"}</h2></div>
          {!current ? <button type="button" onClick={() => setDialog({ type: "open", previous: data.history[0] ?? null })} className="min-h-12 bg-accent px-6 text-xs uppercase tracking-[0.18em] text-background">Open Register</button> : <span className="w-fit border border-emerald-500/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-emerald-300">Open</span>}
        </div>
        {current ? <div className="p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Expected cash</p><p className="mt-2 font-admin-display text-3xl text-accent">{formatMoney(current.expectedCash)}</p></div><div><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Opened</p><p className="mt-2 text-sm text-foreground">{displayDate(current.session.opened_at)}</p></div><div><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Opened by</p><p className="mt-2 text-sm text-foreground">{current.openedByLabel}</p></div><div><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Opening cash</p><p className="mt-2 text-sm text-foreground">{formatMoney(current.session.opening_cash)}</p></div></div><div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><button type="button" onClick={() => setDialog({ type: "view", session: current })} className="min-h-11 border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">View</button><button type="button" onClick={() => setDialog({ type: "deposit", session: current })} className="min-h-11 border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">Deposit</button><button type="button" onClick={() => setDialog({ type: "withdrawal", session: current })} className="min-h-11 border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">Withdrawal</button><button type="button" onClick={() => setDialog({ type: "close", session: current })} className="min-h-11 border border-accent/60 px-4 text-xs uppercase tracking-[0.14em] text-accent">Close Register</button></div></div> : <div className="p-5 text-sm leading-6 text-foreground-muted sm:p-6">Open a register to track the physical cash drawer. Payments can still be recorded while it is closed.</div>}
      </section>

      {current ? (
        <section className="border border-border bg-surface p-5 sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Live Summary</p><h2 className="mt-2 font-admin-display text-2xl uppercase text-foreground">Payments & Cash Drawer</h2></div>
            <p className="text-right text-xs text-foreground-muted">Total payments<br/><span className="text-sm text-foreground">{formatMoney(current.breakdown.paymentMethods.reduce((sum, item) => sum + item.payments, 0))}</span></p>
          </div>
          <RegisterOverview detail={current} />
        </section>
      ) : null}

      <section>
        <div><p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Audit History</p><h2 className="mt-2 font-admin-display text-3xl uppercase text-foreground">Register History</h2></div>
        <div className="mt-5 grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4">
          <DateTimePicker mode="date" label="From" value={historyFrom} onChange={setHistoryFrom} clearable placeholder="Any date" />
          <DateTimePicker mode="date" label="To" value={historyTo} onChange={setHistoryTo} clearable placeholder="Any date" />
          <label><span className="text-[9px] uppercase tracking-[0.14em] text-foreground-muted">Admin</span><input value={historyAdmin} onChange={(event) => setHistoryAdmin(event.target.value)} placeholder="Admin or ID" className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm text-foreground placeholder:text-foreground-muted" /></label>
          <AdminSelect label="Reconciliation" value={historyStatus} onChange={(value) => setHistoryStatus(value as typeof historyStatus)} options={[{ value: "all", label: "All sessions" }, { value: "balanced", label: "Balanced" }, { value: "discrepancy", label: "With discrepancy" }]} />
        </div>
        <div className="mt-4 grid gap-4">
          {history.map((detail) => <article key={detail.session.id} className="border border-border bg-surface p-5 sm:p-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-6"><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">Date</p><p className="mt-2 text-sm text-foreground">{localDate(detail.session.opened_at)}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">Session</p><p className="mt-2 text-sm text-foreground">{localTime(detail.session.opened_at)}–{detail.session.closed_at ? localTime(detail.session.closed_at) : "—"}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">Opened by</p><p className="mt-2 text-sm text-foreground">{detail.openedByLabel}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">Opening</p><p className="mt-2 text-sm text-foreground">{formatMoney(detail.session.opening_cash)}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">Expected / Actual</p><p className="mt-2 text-sm text-foreground">{formatMoney(detail.expectedCash)} / {formatMoney(detail.session.actual_cash ?? 0)}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">{reconciliationStatus(detail.session.difference ?? 0)}</p><p className={`mt-2 text-sm ${(detail.session.difference ?? 0) < 0 ? "text-rose-300" : "text-foreground"}`}>{(detail.session.difference ?? 0) > 0 ? "+" : ""}{formatMoney(detail.session.difference ?? 0)}</p></div></div><div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end"><span className="border border-border px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-foreground-muted">Closed</span><button type="button" onClick={() => setDialog({ type: "view", session: detail })} className="min-h-11 border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">View</button></div></div></article>)}
          {!history.length ? <div className="border border-border bg-surface p-8 text-center text-sm text-foreground-muted">No closed register sessions yet.</div> : null}
        </div>
      </section>
      {dialog ? <RegisterDialog key={`${dialog.type}-${"session" in dialog ? dialog.session.session.id : "new"}`} dialog={dialog} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
