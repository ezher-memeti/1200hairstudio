"use client";

import { useFinanceFormatters } from "./use-finance-formatters";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";

import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
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

function localDate(value: string, locale: string = "de") {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
  }).format(new Date(value));
}

function localTime(value: string, locale: string = "de") {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AmountRow({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  const { formatMoney } = useFinanceFormatters();

  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-foreground-secondary">{displayText(label)}</span>
      <span className={negative && value ? "text-rose-300" : "text-foreground"}>
        {negative && value ? "−" : ""}{formatMoney(value)}
      </span>
    </div>
  );
}

function RegisterOverview({ detail }: { detail: RegisterSessionDetail }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  const { formatMoney } = useFinanceFormatters();

  const ui = useTranslations("ui");

  const { breakdown } = detail;
  return (
    <div className="space-y-5">
      <section className="border border-border bg-background/30 p-4 sm:p-5">
        <h3 className="font-admin-display text-xl uppercase text-foreground">{ui("m758ec54e430e")}</h3>
        <div className="mt-3 divide-y divide-border/60">
          <AmountRow label={ui("m1403f478cc64")} value={breakdown.openingCash} />
          <AmountRow label={ui("m486fba75b697")} value={breakdown.cashPayments} />
          {breakdown.cashTips ? <AmountRow label={ui("m01b9819f6779")} value={breakdown.cashTips} /> : null}
          <AmountRow label={ui("m460f6e60e6c9")} value={breakdown.deposits} />
          <AmountRow label={ui("m0745d2530931")} value={breakdown.withdrawals} negative />
          <AmountRow label={ui("mffa84b630000")} value={breakdown.cashRefunds} negative />
        </div>
      </section>
      {breakdown.paymentMethods.filter((item) => item.method !== "cash").map((item) => (
        <section key={item.method} className="border border-border bg-background/30 p-4 sm:p-5">
          <h3 className="font-admin-display text-xl uppercase text-foreground">{displayText(METHOD_LABELS[item.method])}</h3>
          <div className="mt-3 divide-y divide-border/60">
            <AmountRow label={ui("m44357ae55a21")} value={item.payments} />
            {item.tips ? <AmountRow label={ui("m4cf1b54b003a")} value={item.tips} /> : null}
            {item.refunds ? <AmountRow label={ui("mbe32adaa88de")} value={item.refunds} negative /> : null}
          </div>
        </section>
      ))}
      <div className="flex items-end justify-between gap-4 border-t border-accent/40 pt-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-foreground-muted">{ui("m03a4f45b9988")}</p>
          <p className="mt-2 font-admin-display text-3xl text-accent">{formatMoney(detail.expectedCash)}</p>
        </div>
        {detail.session.status === "closed" ? (
          <div className="text-right text-xs text-foreground-secondary">
            <p>{ui("m7bb2ee60f7c8")}{" "}{formatMoney(detail.session.actual_cash ?? 0)}</p>
            <p className={(detail.session.difference ?? 0) < 0 ? "mt-1 text-rose-300" : "mt-1 text-foreground"}>
              {ui("mb16f1f66543d")}{formatMoney(detail.session.difference ?? 0)}
            </p>
          </div>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-foreground-muted">{ui("m2628cb6378bd")}</p>
    </div>
  );
}

function RegisterActivity({ detail }: { detail: RegisterSessionDetail }) {
  const { formatMoney, displayDate } = useFinanceFormatters();

  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  const locale = useLocale();

  const ui = useTranslations("ui");

  return (
    <div className="divide-y divide-border">
      {detail.activity.map((item) => (
        <article key={item.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-3 py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
          <time className="text-xs text-foreground-muted">{localTime(item.at, locale)}</time>
          <div className="min-w-0">
            <p className="text-sm text-foreground">{item.title}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-foreground-muted">
              {displayText(item.kind === "opened" || item.kind === "closed" ? item.kind : item.paymentMethod ? METHOD_LABELS[item.paymentMethod] : item.kind)}
            </p>
            {item.description ? <p className="mt-2 break-words text-xs leading-5 text-foreground-secondary">“{item.description}”</p> : null}
            {item.customerName ? <p className="mt-2 text-xs text-foreground-secondary">{ui("m95669d494e9d")}{" "}{item.customerName}</p> : null}
            {item.appointmentAt ? <p className="mt-1 text-xs text-foreground-muted">{ui("m06854c739a8a")}{" "}{displayDate(item.appointmentAt)}</p> : null}
            {item.adminLabel ? <p className="mt-1 text-xs text-foreground-muted">{item.adminLabel}</p> : null}
            {item.kind === "closed" ? <p className="mt-2 text-xs leading-5 text-foreground-secondary">{ui("m6ac87f344682")}{" "}{formatMoney(item.expectedCash ?? 0)} {" "}{ui("m5e1bac50049f")}{" "}{formatMoney(item.actualCash ?? 0)} · {displayText(reconciliationStatus(item.difference ?? 0))} {formatMoney(item.difference ?? 0)}</p> : null}
            {item.appointmentId ? <Link href={`/admin/appointments?appointmentId=${encodeURIComponent(item.appointmentId)}`} className="mt-2 inline-flex min-h-10 items-center text-[10px] uppercase tracking-[0.14em] text-accent">{ui("mc44d85b4aebf")}</Link> : null}
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
  const locale = useLocale();
  const ui = useTranslations("ui");
  const uiText = useUiText();

  const [tab, setTab] = useState<"overview" | "activity" | "report">("overview");
  return (
    <>
      <div className={`grid ${detail.session.status === "closed" ? "grid-cols-3" : "grid-cols-2"} border border-border bg-background p-1`}>
        {(["overview", "activity", ...(detail.session.status === "closed" ? ["report" as const] : [])] as const).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`min-h-11 px-4 text-[10px] uppercase tracking-[0.18em] ${tab === item ? "bg-accent text-background" : "text-foreground-secondary"}`}>{uiText(item)}</button>
        ))}
      </div>
      <div className="mt-5">{tab === "overview" ? <RegisterOverview detail={detail} /> : tab === "activity" ? <RegisterActivity detail={detail} /> : <div className="grid gap-3 sm:grid-cols-3"><a href={`/api/admin/register-sessions/${detail.session.id}/report?locale=${locale}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">{ui("m52bc93f4eb9a")}</a><a href={`/api/admin/register-sessions/${detail.session.id}/report?locale=${locale}&format=pdf`} className="inline-flex min-h-11 items-center justify-center border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">{ui("m98e5ef062b2a")}</a><a href={`/api/admin/register-sessions/${detail.session.id}/report?locale=${locale}&format=print`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center border border-accent/60 px-4 text-xs uppercase tracking-[0.14em] text-accent">{ui("m5b221e9c2a45")}</a></div>}</div>
    </>
  );
}

function RegisterDialog({ dialog, onClose }: { dialog: Exclude<DialogState, null>; onClose: () => void }) {
  const { formatMoney, displayDate } = useFinanceFormatters();

  const uiText = useUiText();

  const ui = useTranslations("ui");
  const audit = useTranslations("audit");

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
          <div><p className="text-[10px] uppercase tracking-[0.2em] text-accent">{ui("m3065208617d9")}</p><h2 className="mt-2 font-admin-display text-2xl uppercase text-foreground sm:text-3xl">{uiText(title)}</h2></div>
          <button type="button" onClick={onClose} disabled={pending} className="inline-flex size-11 items-center justify-center border border-border text-foreground-secondary" aria-label={ui("m7b29020292a4")}><X size={17} /></button>
        </header>
        <div className="p-4 sm:p-6">
          {dialog.type === "view" ? <DetailView detail={dialog.session} /> : (
            <div className="space-y-5">
              {dialog.type === "close" ? <RegisterOverview detail={dialog.session} /> : null}
              {dialog.type === "open" && dialog.previous ? <div className="border border-border bg-background/30 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{ui("mb702cd6acf30")}</p><p className="mt-2 text-sm text-foreground-secondary">{ui("m88d86b7721d5")}{" "}{displayDate(dialog.previous.session.closed_at ?? dialog.previous.session.opened_at)}</p><p className="mt-1 text-sm text-foreground">{ui("m5a615c2369a7")}{" "}{formatMoney(dialog.previous.session.actual_cash ?? 0)}</p><p className="mt-2 text-xs leading-5 text-foreground-muted">{ui("m4d339a55760b")}</p></div> : null}
              {dialog.type === "close" ? <div className="grid grid-cols-2 border border-border bg-background p-1"><button type="button" onClick={() => setCountMode("manual")} className={`min-h-11 px-3 text-[10px] uppercase tracking-[0.14em] ${countMode === "manual" ? "bg-accent text-background" : "text-foreground-secondary"}`}>{ui("m04b2f623e148")}</button><button type="button" onClick={() => setCountMode("denominations")} className={`min-h-11 px-3 text-[10px] uppercase tracking-[0.14em] ${countMode === "denominations" ? "bg-accent text-background" : "text-foreground-secondary"}`}>{ui("m6a8f0c825085")}</button></div> : null}
              {dialog.type !== "close" || countMode === "manual" ? <label className="block"><span className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{uiText(dialog.type === "open" ? "Opening cash" : dialog.type === "close" ? "Actual cash counted" : "Amount")} (CHF)</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" className="mt-2 min-h-12 w-full border border-border bg-background px-4 text-foreground outline-none focus:border-accent" /></label> : <div className="space-y-5 border border-border bg-background/30 p-4"><p className="text-[10px] uppercase tracking-[0.2em] text-accent">{ui("m6a8f0c825085")}</p>{(["Notes","Coins"] as const).map((group) => <section key={group}><h3 className="text-xs uppercase tracking-[0.16em] text-foreground-muted">{group === "Notes" ? uiText("Banknotes") : uiText("Coins")}</h3><div className="mt-2 divide-y divide-border/60">{DENOMINATIONS.filter((item) => item.group === group).map((item) => { const quantity = quantities[item.cents] ?? 0; return <div key={item.cents} className="grid grid-cols-[5rem_5rem_minmax(0,1fr)] items-center gap-3 py-2"><span className="text-xs text-foreground-secondary">{uiText(item.label)}</span><input type="number" min="0" step="1" value={quantity || ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.cents]: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))} aria-label={audit("quantity", { label: uiText(item.label) })} className="min-h-10 w-full border border-border bg-surface px-3 text-center text-sm text-foreground outline-none focus:border-accent" /><span className="text-right text-xs text-foreground">{formatMoney(item.cents * quantity / 100)}</span></div>; })}</div></section>)}<div className="flex justify-between border-t border-accent/40 pt-4"><span className="text-xs uppercase tracking-[0.16em] text-foreground-muted">{ui("mb25928c69902")}</span><strong className="text-lg text-accent">{formatMoney(denominationCents / 100)}</strong></div></div>}
              {dialog.type === "close" ? <div className="grid grid-cols-3 gap-2 border border-border bg-background/30 p-4 text-xs sm:gap-4"><div><span className="text-foreground-muted">{ui("m6ac87f344682")}</span><strong className="mt-1 block text-foreground">{formatMoney(dialog.session.expectedCash)}</strong></div><div><span className="text-foreground-muted">{ui("m319a2b6e851d")}</span><strong className="mt-1 block text-foreground">{uiText(Number.isFinite(numericAmount) ? formatMoney(numericAmount) : "—")}</strong></div><div><span className="text-foreground-muted">{uiText(reconciliationStatus(difference))}</span><strong className={`mt-1 block ${difference < 0 ? "text-rose-300" : "text-accent"}`}>{formatMoney(difference)}</strong></div></div> : null}
              <label className="block"><span className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{dialog.type === "close" ? difference !== 0 ? uiText("Discrepancy reason *") : uiText("Closing note (Optional)") : dialog.type === "open" ? uiText("Opening note (Optional)") : uiText("Note / reason (Optional)")}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full resize-y border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-accent" /></label>
              {feedback ? <p className="text-sm text-rose-300">{uiText(feedback)}</p> : null}
            </div>
          )}
        </div>
        {dialog.type !== "view" ? <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:flex-row sm:justify-end sm:p-5"><button type="button" onClick={onClose} disabled={pending} className="min-h-11 border border-border px-5 text-xs uppercase tracking-[0.16em] text-foreground-secondary">{ui("m77dfd2135f4d")}</button><button type="button" onClick={submit} disabled={pending || !Number.isFinite(numericAmount) || (dialog.type === "close" && difference !== 0 && !note.trim())} className="min-h-11 bg-accent px-5 text-xs uppercase tracking-[0.16em] text-background disabled:opacity-50">{uiText(pending ? "Saving…" : title)}</button></footer> : null}
      </div>
    </div>
  );
}

export default function RegisterManager({ data }: { data: RegisterPageData }) {
  const { formatMoney, displayDate } = useFinanceFormatters();

  const locale = useLocale();

  const uiText = useUiText();

  const ui = useTranslations("ui");

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
          <div><p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">{ui("maf6aa7d50c3b")}</p><h2 className="mt-2 font-admin-display text-3xl uppercase text-foreground">{uiText(current ? "Register Open" : "Register is closed")}</h2></div>
          {!current ? <button type="button" onClick={() => setDialog({ type: "open", previous: data.history[0] ?? null })} className="min-h-12 bg-accent px-6 text-xs uppercase tracking-[0.18em] text-background">{ui("md60d20b9427b")}</button> : <span className="w-fit border border-emerald-500/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-emerald-300">{ui("mcf9b77061f7b")}</span>}
        </div>
        {current ? <div className="p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{ui("m8562d432f046")}</p><p className="mt-2 font-admin-display text-3xl text-accent">{formatMoney(current.expectedCash)}</p></div><div><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{ui("mc4f1f5b1d49f")}</p><p className="mt-2 text-sm text-foreground">{displayDate(current.session.opened_at)}</p></div><div><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{ui("m9e2e4dc58a0b")}</p><p className="mt-2 text-sm text-foreground">{current.openedByLabel}</p></div><div><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{ui("m37010478f307")}</p><p className="mt-2 text-sm text-foreground">{formatMoney(current.session.opening_cash)}</p></div></div><div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><button type="button" onClick={() => setDialog({ type: "view", session: current })} className="min-h-11 border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">{ui("m69bd4ef9fbd0")}</button><button type="button" onClick={() => setDialog({ type: "deposit", session: current })} className="min-h-11 border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">{ui("me7b0b317a6e8")}</button><button type="button" onClick={() => setDialog({ type: "withdrawal", session: current })} className="min-h-11 border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">{ui("m730e3730d072")}</button><button type="button" onClick={() => setDialog({ type: "close", session: current })} className="min-h-11 border border-accent/60 px-4 text-xs uppercase tracking-[0.14em] text-accent">{ui("m61eec5d1c736")}</button></div></div> : <div className="p-5 text-sm leading-6 text-foreground-muted sm:p-6">{ui("m1a8bc7543bb9")}</div>}
      </section>

      {current ? (
        <section className="border border-border bg-surface p-5 sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">{ui("mae45d3829fea")}</p><h2 className="mt-2 font-admin-display text-2xl uppercase text-foreground">{ui("m4cd4baaac342")}</h2></div>
            <p className="text-right text-xs text-foreground-muted">{ui("me3788e99c66d")}<br/><span className="text-sm text-foreground">{formatMoney(current.breakdown.paymentMethods.reduce((sum, item) => sum + item.payments, 0))}</span></p>
          </div>
          <RegisterOverview detail={current} />
        </section>
      ) : null}

      <section>
        <div><p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">{ui("m2a27af1448f2")}</p><h2 className="mt-2 font-admin-display text-3xl uppercase text-foreground">{ui("ma3872a314144")}</h2></div>
        <div className="mt-5 grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4">
          <DateTimePicker mode="date" label={ui("m3f66052a107e")} value={historyFrom} onChange={setHistoryFrom} clearable placeholder={ui("m1d6db9d23a9c")} />
          <DateTimePicker mode="date" label={ui("mae79ea1e9c63")} value={historyTo} onChange={setHistoryTo} clearable placeholder={ui("m1d6db9d23a9c")} />
          <label><span className="text-[9px] uppercase tracking-[0.14em] text-foreground-muted">{ui("m4e7afebcfbae")}</span><input value={historyAdmin} onChange={(event) => setHistoryAdmin(event.target.value)} placeholder={ui("m8feb395f41c1")} className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm text-foreground placeholder:text-foreground-muted" /></label>
          <AdminSelect label={ui("mb29da9dd20f2")} value={historyStatus} onChange={(value) => setHistoryStatus(value as typeof historyStatus)} options={[{ value: "all", label: "All sessions" }, { value: "balanced", label: "Balanced" }, { value: "discrepancy", label: "With discrepancy" }]} />
        </div>
        <div className="mt-4 grid gap-4">
          {history.map((detail) => <article key={detail.session.id} className="border border-border bg-surface p-5 sm:p-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-6"><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">{ui("meb9a4bc1c0c1")}</p><p className="mt-2 text-sm text-foreground">{localDate(detail.session.opened_at, locale)}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">{ui("mf7f1997c6cd1")}</p><p className="mt-2 text-sm text-foreground">{localTime(detail.session.opened_at, locale)}–{uiText(detail.session.closed_at ? localTime(detail.session.closed_at, locale) : "—")}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">{ui("m9e2e4dc58a0b")}</p><p className="mt-2 text-sm text-foreground">{detail.openedByLabel}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">{ui("m56e44065a564")}</p><p className="mt-2 text-sm text-foreground">{formatMoney(detail.session.opening_cash)}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">{ui("m8ad7d25b2481")}</p><p className="mt-2 text-sm text-foreground">{formatMoney(detail.expectedCash)} / {formatMoney(detail.session.actual_cash ?? 0)}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-foreground-muted">{uiText(reconciliationStatus(detail.session.difference ?? 0))}</p><p className={`mt-2 text-sm ${(detail.session.difference ?? 0) < 0 ? "text-rose-300" : "text-foreground"}`}>{uiText((detail.session.difference ?? 0) > 0 ? "+" : "")}{formatMoney(detail.session.difference ?? 0)}</p></div></div><div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end"><span className="border border-border px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-foreground-muted">{ui("m88d86b7721d5")}</span><button type="button" onClick={() => setDialog({ type: "view", session: detail })} className="min-h-11 border border-border px-4 text-xs uppercase tracking-[0.14em] text-foreground-secondary">{ui("m69bd4ef9fbd0")}</button></div></div></article>)}
          {!history.length ? <div className="border border-border bg-surface p-8 text-center text-sm text-foreground-muted">{ui("m814dedb4885e")}</div> : null}
        </div>
      </section>
      {dialog ? <RegisterDialog key={`${dialog.type}-${"session" in dialog ? dialog.session.session.id : "new"}`} dialog={dialog} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
