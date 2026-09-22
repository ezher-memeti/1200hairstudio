"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeCheckout } from "@/app/actions/checkout";
import AdminSelect from "@/components/admin/AdminSelect";
import type { PaymentMethodSetting } from "@/lib/admin/settings";
import type { FinanceAppointment, FinancePromotion } from "@/lib/finance/types";

type Split = { method: PaymentMethodSetting; amount: string; cashReceived: string };
type DiscountMode = "none" | "existing" | "promotion" | "manual_percentage" | "manual_fixed";
const field = "mt-2 min-h-11 w-full border border-border bg-background px-3 text-foreground";
const paymentLabel = (value: string) => value.replaceAll("_", " ").toUpperCase();

export default function CheckoutDialog({ appointment, promotions, enabledPaymentMethods, onClose }: { appointment: FinanceAppointment; promotions: FinancePromotion[]; enabledPaymentMethods: PaymentMethodSetting[]; onClose: () => void }) {
  const router = useRouter();
  const [discountMode, setDiscountMode] = useState<DiscountMode>(appointment.discountAmount > 0 ? "existing" : "none");
  const [promotionId, setPromotionId] = useState(appointment.promotionId ?? "");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [tipMode, setTipMode] = useState<"none" | "percentage" | "fixed">("none");
  const [tipValue, setTipValue] = useState("");
  const [payments, setPayments] = useState<Split[]>([{ method: enabledPaymentMethods[0] ?? "cash", amount: appointment.amountDue.toFixed(2), cashReceived: "" }]);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const subtotal = appointment.originalPrice;
  const discount = useMemo(() => {
    if (discountMode === "existing") return appointment.discountAmount;
    if (discountMode === "promotion") {
      const item = promotions.find((promotion) => promotion.id === promotionId);
      if (!item) return 0;
      return item.discount_type === "percentage" ? Math.min(subtotal, Math.round(subtotal * item.discount_value) / 100) : Math.min(subtotal, item.discount_value);
    }
    const value = Number(discountValue) || 0;
    return discountMode === "manual_percentage" ? Math.min(subtotal, Math.round(subtotal * Math.min(100, value)) / 100) : discountMode === "manual_fixed" ? Math.min(subtotal, value) : 0;
  }, [appointment.discountAmount, discountMode, discountValue, promotionId, promotions, subtotal]);
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const tip = tipMode === "percentage" ? Math.round(total * (Number(tipValue) || 0)) / 100 : tipMode === "fixed" ? Math.round((Number(tipValue) || 0) * 100) / 100 : 0;
  const due = total + tip;
  const paid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const change = payments.filter((payment) => payment.method === "cash").reduce((sum, payment) => sum + Math.max(0, (Number(payment.cashReceived) || Number(payment.amount) || 0) - (Number(payment.amount) || 0)), 0);
  const update = (index: number, values: Partial<Split>) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  const balanceLast = () => setPayments((current) => current.map((item, index) => index === current.length - 1 ? { ...item, amount: Math.max(0, due - current.slice(0, -1).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)).toFixed(2) } : item));
  const submit = () => startTransition(async () => {
    setFeedback("");
    const result = await completeCheckout({ appointmentId: appointment.appointmentId, discountMode, promotionId: promotionId || null, manualDiscountValue: Number(discountValue), discountReason, tipMode, tipValue: Number(tipValue), payments: payments.filter((item) => Number(item.amount) > 0).map((item) => ({ method: item.method, amount: Number(item.amount), cashReceived: item.method === "cash" ? Number(item.cashReceived || item.amount) : undefined })), sendReceipt: true });
    if (result.error) return setFeedback(result.error);
    router.refresh();
    onClose();
  });

  const discountOptions = [
    ...(appointment.discountAmount > 0 ? [{ value: "existing", label: `Existing · ${appointment.discountLabel ?? appointment.discountSource ?? "discount"}` }] : []),
    { value: "none", label: "No discount" },
    { value: "promotion", label: "Promotion" },
    { value: "manual_percentage", label: "Manual percentage" },
    { value: "manual_fixed", label: "Manual fixed CHF" },
  ];
  const paymentOptions = enabledPaymentMethods.map((method) => ({ value: method, label: paymentLabel(method) }));

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-background/80 p-3 backdrop-blur-sm sm:items-center">
      <section className="my-auto w-full max-w-3xl overflow-visible border border-border bg-surface">
        <header className="sticky top-0 z-10 flex justify-between gap-4 border-b border-border bg-surface p-4 sm:p-5">
          <div className="min-w-0"><p className="text-xs uppercase tracking-[.18em] text-accent">Checkout</p><h2 className="mt-2 break-words font-admin-display text-2xl uppercase text-foreground sm:text-3xl">{appointment.serviceName}</h2><p className="mt-1 break-words text-sm text-foreground-muted">{appointment.customerName} · {appointment.bookingReference}</p></div>
          <button type="button" onClick={onClose} className="size-11 shrink-0 border border-border">×</button>
        </header>
        <div className="space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminSelect label="Discount" value={discountMode} onChange={(value) => setDiscountMode(value as DiscountMode)} options={discountOptions} />
            {discountMode === "promotion" ? <AdminSelect label="Promotion" value={promotionId} onChange={setPromotionId} placeholder="Choose promotion" options={promotions.map((item) => ({ value: item.id, label: item.name }))} /> : null}
            {discountMode.startsWith("manual") ? <><label className="text-xs text-foreground-muted">Discount value<input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} className={field}/></label><label className="text-xs text-foreground-muted sm:col-span-2">Reason<input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} className={field}/></label></> : null}
            <AdminSelect label="Tip" value={tipMode} onChange={(value) => setTipMode(value as typeof tipMode)} options={[{ value: "none", label: "No tip" }, { value: "percentage", label: "Percentage" }, { value: "fixed", label: "Custom CHF" }]} />
            {tipMode !== "none" ? <label className="text-xs text-foreground-muted">Tip value<input value={tipValue} onChange={(event) => setTipValue(event.target.value)} className={field}/></label> : null}
          </div>
          <div className="border border-border bg-background/30 p-4 text-sm">{[["Subtotal", subtotal], ["Discount", -discount], ["Tax", 0], ["Final total", total], ["Tip", tip], ["Amount to collect", due]].map(([label, value]) => <div key={String(label)} className="flex justify-between py-1.5"><span className="text-foreground-muted">{label}</span><span>CHF {Number(value).toFixed(2)}</span></div>)}</div>
          <section>
            <div className="flex items-center justify-between"><h3 className="text-xs uppercase tracking-[.18em] text-foreground-muted">Payment Split</h3><button type="button" onClick={() => setPayments((current) => [...current, { method: enabledPaymentMethods[0] ?? "cash", amount: "", cashReceived: "" }])} className="min-h-10 text-xs uppercase text-accent">+ Add Method</button></div>
            <div className="mt-3 space-y-3">{payments.map((payment, index) => <div key={index} className="grid gap-3 border border-border p-3 sm:grid-cols-3"><AdminSelect label="Payment method" value={payment.method} onChange={(value) => update(index, { method: value as PaymentMethodSetting })} options={paymentOptions}/><label className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">Payment amount<input aria-label="Payment amount" value={payment.amount} onChange={(event) => update(index, { amount: event.target.value })} placeholder="Amount" className={field}/></label>{payment.method === "cash" ? <label className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">Cash received<input aria-label="Cash received" value={payment.cashReceived} onChange={(event) => update(index, { cashReceived: event.target.value })} placeholder="Cash received" className={field}/></label> : <button type="button" onClick={() => setPayments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="min-h-11 self-end border border-border text-xs uppercase text-foreground-muted">Remove</button>}</div>)}</div>
            <button type="button" onClick={balanceLast} className="mt-3 min-h-10 text-xs uppercase tracking-[.14em] text-accent">Balance final split</button>
          </section>
          <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm"><div><span className="text-foreground-muted">Due</span><p>CHF {due.toFixed(2)}</p></div><div><span className="text-foreground-muted">Paid</span><p>CHF {paid.toFixed(2)}</p></div><div><span className="text-foreground-muted">Change</span><p className="text-accent">CHF {change.toFixed(2)}</p></div></div>
          {feedback ? <p className="text-sm text-rose-300">{feedback}</p> : null}
        </div>
        <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-border bg-surface p-4 min-[430px]:flex-row min-[430px]:justify-end"><button type="button" onClick={onClose} className="min-h-11 border border-border px-5 text-xs uppercase">Cancel</button><button type="button" disabled={pending || Math.round(paid * 100) !== Math.round(due * 100)} onClick={submit} className="min-h-11 bg-accent px-5 text-xs uppercase text-background disabled:opacity-40">{pending ? "Completing…" : "Complete Sale"}</button></footer>
      </section>
    </div>
  );
}
