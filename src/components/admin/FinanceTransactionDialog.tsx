"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { recordAdminTransaction } from "@/app/actions/finance";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";
import type { AppointmentDiscountMode, FinanceAppointment, FinancePromotion, PaymentMethod, TransactionType } from "@/lib/finance/types";
import type { PaymentMethodSetting } from "@/lib/admin/settings";

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "twint", label: "TWINT" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

function zurichNowValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default function FinanceTransactionDialog({
  appointment,
  promotions,
  transactionType,
  enabledPaymentMethods,
  receiptEmailEnabled,
  onClose,
  onSuccess,
}: {
  appointment: FinanceAppointment;
  promotions: FinancePromotion[];
  transactionType: TransactionType;
  enabledPaymentMethods: PaymentMethodSetting[];
  receiptEmailEnabled: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}) {
  const router = useRouter();
  const defaultAmount = transactionType === "payment"
    ? Math.max(0, appointment.amountDue - appointment.netPaid)
    : Math.max(0, appointment.netPaid);
  const [amount, setAmount] = useState(defaultAmount.toFixed(2));
  const availableMethods = METHODS.filter((option) => enabledPaymentMethods.includes(option.value));
  const [method, setMethod] = useState<PaymentMethod>(availableMethods[0]?.value ?? "cash");
  const [paidAt, setPaidAt] = useState(zurichNowValue);
  const [notes, setNotes] = useState("");
  const [discountMode, setDiscountMode] = useState<AppointmentDiscountMode>(appointment.discountSource === "custom" ? "custom" : appointment.discountSource === "promotion" || appointment.promotionId ? "promotion" : "none");
  const [promotionId, setPromotionId] = useState(appointment.promotionId ?? "");
  const [customLabel, setCustomLabel] = useState(appointment.discountSource === "custom" ? appointment.discountLabel ?? "" : "");
  const [customType, setCustomType] = useState<"percentage" | "fixed">(appointment.discountSource === "custom" && (appointment.discountType === "percentage" || appointment.discountType === "fixed") ? appointment.discountType : "percentage");
  const [customValue, setCustomValue] = useState(appointment.discountSource === "custom" && appointment.discountValue != null ? String(appointment.discountValue) : "");
  const [feedback, setFeedback] = useState("");
  const [sendReceipt, setSendReceipt] = useState(false);
  const [isPending, startTransition] = useTransition();
  const now = Date.now();
  const promotionOptions = promotions;
  const selectedPromotion = promotionOptions.find((promotion) => promotion.id === promotionId);
  const originalPrice = appointment.originalPrice || appointment.amountDue + appointment.discountAmount;
  const preservesExistingPromotion = Boolean(discountMode === "promotion" && promotionId && promotionId === appointment.promotionId && appointment.discountSource === "promotion");
  const discountPreview = discountMode === "custom"
    ? { type: customType, value: Number(customValue) }
    : discountMode === "promotion" && selectedPromotion
      ? { type: selectedPromotion.discount_type, value: selectedPromotion.discount_value }
      : null;
  const calculatedDiscount = discountPreview && Number.isFinite(discountPreview.value) && discountPreview.value > 0
    ? discountPreview.type === "percentage"
      ? Math.min(originalPrice, Math.round(originalPrice * Math.min(100, discountPreview.value)) / 100)
      : Math.min(originalPrice, Math.round(discountPreview.value * 100) / 100)
    : 0;
  const previewDiscount = preservesExistingPromotion ? appointment.discountAmount : calculatedDiscount;
  const previewFinal = preservesExistingPromotion ? appointment.amountDue : Math.max(0, originalPrice - previewDiscount);
  const previewRemaining = Math.max(0, previewFinal - appointment.netPaid);
  const discountChanged = discountMode !== (appointment.discountSource === "custom" ? "custom" : appointment.discountSource === "promotion" || appointment.promotionId ? "promotion" : "none") || (discountMode === "promotion" && (appointment.promotionId ?? "") !== promotionId);
  const fullyPaid = appointment.amountDue > 0 && appointment.netPaid >= appointment.amountDue;
  const discountSummaryLabel = discountMode === "custom" ? customLabel.trim() || "Custom discount" : discountMode === "promotion" ? selectedPromotion?.name ?? appointment.discountLabel ?? "Promotion" : "Discount";

  function syncAmount(nextMode: AppointmentDiscountMode, nextPromotionId = promotionId, nextType = customType, nextValue = customValue) {
    let discount = 0;
    if (nextMode === "promotion") {
      if (nextPromotionId === appointment.promotionId && appointment.discountSource === "promotion") discount = appointment.discountAmount;
      else {
        const promotion = promotionOptions.find((item) => item.id === nextPromotionId);
        if (promotion) discount = promotion.discount_type === "percentage" ? Math.min(originalPrice, Math.round(originalPrice * Math.min(100, promotion.discount_value)) / 100) : Math.min(originalPrice, Math.round(promotion.discount_value * 100) / 100);
      }
    } else if (nextMode === "custom") {
      const value = Number(nextValue);
      if (Number.isFinite(value) && value > 0) discount = nextType === "percentage" ? Math.min(originalPrice, Math.round(originalPrice * Math.min(100, value)) / 100) : Math.min(originalPrice, Math.round(value * 100) / 100);
    }
    setAmount(Math.max(0, originalPrice - discount - appointment.netPaid).toFixed(2));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape" && !isPending) onClose(); }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isPending, onClose]);

  function submit() {
    startTransition(async () => {
      setFeedback("");
      const result = await recordAdminTransaction({
        appointmentId: appointment.appointmentId,
        transactionType,
        amount: Number(amount),
        paymentMethod: method,
        paidAt,
        notes,
        promotionId: transactionType === "payment" ? promotionId || null : undefined,
        discountMode: transactionType === "payment" ? discountMode : undefined,
        customDiscountLabel: discountMode === "custom" ? customLabel : undefined,
        customDiscountType: discountMode === "custom" ? customType : undefined,
        customDiscountValue: discountMode === "custom" ? Number(customValue) : undefined,
        sendReceipt: transactionType === "payment" ? sendReceipt : false,
      });
      if (result.error) { setFeedback(result.error); return; }
      const message = transactionType === "payment"
        ? "paymentCreated" in result && result.paymentCreated === false
          ? "Discount applied. No payment was required."
          : "Payment recorded."
        : "Refund recorded.";
      const receiptMessage = "receiptEmailWarning" in result && result.receiptEmailWarning
        ? ` ${result.receiptEmailWarning}`
        : "receiptEmailStatus" in result && result.receiptEmailStatus === "sent"
          ? " Receipt emailed to the customer."
          : "receiptNumber" in result && result.receiptNumber
            ? ` Receipt ${result.receiptNumber} created.`
            : "";
      onSuccess?.(`${message}${receiptMessage}`);
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden bg-background/80 px-3 backdrop-blur-sm sm:px-5" style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }} role="dialog" aria-modal="true">
      <div className="max-h-[calc(100dvh-24px)] w-full max-w-[760px] overflow-y-auto overscroll-contain border border-border bg-surface shadow-2xl [scrollbar-color:rgba(216,177,116,.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-accent/30 [&::-webkit-scrollbar]:w-1.5">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <div>
            <p className="font-admin-primary text-xs uppercase tracking-[0.3em] text-accent">Finance</p>
            <h2 className="mt-1.5 font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:mt-2 sm:text-3xl">
              Record {transactionType === "payment" ? "Payment" : "Refund"}
            </h2>
            <p className="mt-1.5 font-admin-primary text-xs text-foreground-secondary sm:mt-2 sm:text-sm">
              {appointment.bookingReference} · {appointment.customerName} · {appointment.serviceName}
            </p>
            <p className="mt-1 font-admin-primary text-xs text-foreground-muted">
              {new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(appointment.startAt))}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={isPending} className="inline-flex size-11 shrink-0 items-center justify-center border border-border text-foreground-secondary hover:text-foreground" aria-label="Close"><X size={17} /></button>
        </div>

        <div className="mx-4 mt-4 grid gap-4 sm:mx-6 sm:mt-5 sm:grid-cols-2 sm:gap-5">
          {transactionType === "payment" ? <div className="space-y-3 sm:col-span-2 sm:space-y-4"><div><p className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Discount</p><div className="mt-2 grid grid-cols-1 border border-border bg-[#11110f] p-1 min-[480px]:grid-cols-3">{([['none','No discount'],['promotion','Existing promotion'],['custom','Custom discount']] as const).map(([value,label]) => <button key={value} type="button" disabled={fullyPaid} onClick={() => { setDiscountMode(value); syncAmount(value); }} className={`min-h-11 px-3 font-admin-primary text-[10px] uppercase tracking-[0.12em] transition-colors ${discountMode === value ? 'bg-accent text-background' : 'text-foreground-secondary hover:text-foreground'} disabled:opacity-40`}>{label}</button>)}</div></div>{discountMode === "promotion" ? <AdminSelect label="Promotion" value={promotionId} onChange={(value) => { setPromotionId(value); syncAmount("promotion", value); }} disabled={fullyPaid} placeholder="Select a promotion" options={promotionOptions.map((promotion) => { const active = promotion.is_active && (!promotion.starts_at || new Date(promotion.starts_at).getTime() <= now) && (!promotion.expires_at || new Date(promotion.expires_at).getTime() > now); return { value: promotion.id, label: `${promotion.name} · ${promotion.discount_type === "percentage" ? `${promotion.discount_value}%` : `CHF ${promotion.discount_value.toFixed(2)}`} — ${active ? 'Active' : 'Inactive'}` }; })} /> : null}{discountMode === "custom" ? <div className="grid gap-3 sm:grid-cols-2 sm:gap-4"><label className="block sm:col-span-2"><span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Discount Label</span><input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="Loyal customer" className="mt-2 min-h-11 w-full rounded-[3px] border border-border bg-[#11110f] px-4 font-admin-primary text-sm text-foreground outline-none placeholder:text-foreground-muted focus:border-accent" /></label><AdminSelect label="Discount Type" value={customType} onChange={(value) => { const next = value as 'percentage' | 'fixed'; setCustomType(next); syncAmount('custom', promotionId, next, customValue); }} options={[{value:'percentage',label:'Percentage'},{value:'fixed',label:'Fixed CHF'}]} /><label className="block"><span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Discount Value</span><input value={customValue} onChange={(event) => { setCustomValue(event.target.value); syncAmount('custom', promotionId, customType, event.target.value); }} inputMode="decimal" placeholder={customType === 'percentage' ? '15' : '5.00'} className="mt-2 min-h-11 w-full rounded-[3px] border border-border bg-[#11110f] px-4 font-admin-primary text-sm text-foreground outline-none placeholder:text-foreground-muted focus:border-accent" /></label></div> : null}<p className="font-admin-primary text-[10px] uppercase tracking-[0.14em] text-foreground-muted">Applied to this appointment only{fullyPaid ? " · Discount changes disabled because this appointment is fully paid" : ""}</p></div> : null}
          {transactionType === "payment" && receiptEmailEnabled ? <label className="flex min-h-12 items-center gap-3 border border-border bg-background/30 px-4 sm:col-span-2"><input type="checkbox" checked={sendReceipt} onChange={(event) => setSendReceipt(event.target.checked)} className="size-4 accent-[#d8b174]" /><span><span className="block font-admin-primary text-xs uppercase tracking-[0.14em] text-foreground">Send receipt to customer</span><span className="mt-0.5 block font-admin-primary text-[10px] text-foreground-muted">Sent when the appointment balance is fully settled.</span></span></label> : null}
          {transactionType !== "payment" || previewRemaining > 0 ? <><label className="block">
            <span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Amount (CHF)</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="mt-2 min-h-11 w-full rounded-[3px] border border-border bg-[#11110f] px-4 font-admin-primary text-sm text-foreground outline-none focus:border-accent" />
          </label>
          <AdminSelect label="Payment Method" value={method} onChange={(value) => setMethod(value as PaymentMethod)} options={availableMethods} />
          <DateTimePicker className="sm:col-span-2" mode="datetime" minuteStep={5} label="Paid At" value={paidAt} onChange={setPaidAt} required />
          <label className="block sm:col-span-2">
            <span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Add payment notes (Optional)" className="mt-2 min-h-20 w-full resize-y rounded-[3px] border border-border bg-[#11110f] px-4 py-3 font-admin-primary text-sm text-foreground outline-none placeholder:text-foreground-muted focus:border-accent sm:min-h-24" />
          </label>
          </> : <div className="border border-accent/25 bg-accent/5 px-4 py-3 sm:col-span-2"><p className="font-admin-primary text-xs uppercase tracking-[0.16em] text-accent">No payment required</p><p className="mt-1 font-admin-primary text-sm text-foreground-secondary">The appointment discount will be saved without creating a CHF 0 transaction.</p></div>}
        </div>

        <div className="mx-4 mt-4 space-y-2.5 border border-border bg-background/40 p-3 font-admin-primary text-xs sm:mx-6 sm:mt-5 sm:space-y-3 sm:p-4">
          <div className="flex justify-between gap-4"><span className="text-foreground-muted">Service price</span><span className="text-foreground">CHF {originalPrice.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-foreground-muted">{discountSummaryLabel}{discountMode !== "none" && discountPreview ? ` (${discountPreview.type === "percentage" ? `${discountPreview.value}%` : `CHF ${discountPreview.value.toFixed(2)}`})` : ""}</span><span className={previewDiscount ? "text-accent" : "text-foreground-secondary"}>−CHF {previewDiscount.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 border-t border-border pt-3"><span className="text-foreground-muted">Amount due</span><span className="text-foreground">CHF {previewFinal.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-foreground-muted">Already paid</span><span className="text-foreground-secondary">−CHF {appointment.netPaid.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 border-t border-border pt-3"><span className="uppercase tracking-[0.14em] text-foreground-muted">Remaining</span><span className="text-base text-accent">CHF {previewRemaining.toFixed(2)}</span></div>
        </div>
        {transactionType === "payment" && discountChanged && previewFinal < appointment.netPaid ? <p className="mx-4 mt-3 font-admin-primary text-sm text-rose-300 sm:mx-6 sm:mt-4">This discount cannot be applied because the appointment has already received CHF {appointment.netPaid.toFixed(2)} in payments.</p> : null}
        {feedback ? <p className="mx-4 mt-3 font-admin-primary text-sm text-rose-300 sm:mx-6 sm:mt-4">{feedback}</p> : null}
        <div className="sticky bottom-0 z-20 mt-4 flex flex-col-reverse gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:mt-6 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
          <button type="button" onClick={onClose} disabled={isPending} className="min-h-11 border border-border px-5 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary">Cancel</button>
          <button type="button" onClick={submit} disabled={isPending || (previewRemaining > 0 && !paidAt) || (transactionType === "payment" && previewFinal < appointment.netPaid)} className="min-h-11 bg-accent px-5 font-admin-primary text-xs uppercase tracking-[0.18em] text-background disabled:opacity-50">{isPending ? "Saving..." : transactionType === "payment" && previewRemaining === 0 ? "Apply Discount" : `Record ${transactionType}`}</button>
        </div>
      </div>
    </div>
  );
}
