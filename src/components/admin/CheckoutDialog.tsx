"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { completeCheckout } from "@/app/actions/checkout";
import AdminSelect from "@/components/admin/AdminSelect";
import type { PaymentMethodSetting } from "@/lib/admin/settings";
import type { FinanceAppointment, FinancePromotion } from "@/lib/finance/types";

type Split = { method: PaymentMethodSetting; amount: string; cashReceived: string };
type DiscountMode = "none" | "existing" | "promotion" | "manual_percentage" | "manual_fixed";
const field = "mt-2 min-h-11 w-full border border-border bg-background px-3 text-foreground";
const paymentLabel = (value: string) => value.replaceAll("_", " ").toUpperCase();

export default function CheckoutDialog({ appointment, promotions, enabledPaymentMethods, onClose }: { appointment: FinanceAppointment; promotions: FinancePromotion[]; enabledPaymentMethods: PaymentMethodSetting[]; onClose: () => void }) {
  const uiText = useUiText();

  const ui = useTranslations("ui");

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
          <div className="min-w-0"><p className="text-xs uppercase tracking-[.18em] text-accent">{ui("m3ac8e9e58c5a")}</p><h2 className="mt-2 break-words font-admin-display text-2xl uppercase text-foreground sm:text-3xl">{appointment.serviceName}</h2><p className="mt-1 break-words text-sm text-foreground-muted">{appointment.customerName} · {appointment.bookingReference}</p></div>
          <button type="button" onClick={onClose} className="size-11 shrink-0 border border-border">×</button>
        </header>
        <div className="space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminSelect label={ui("mb524936d7aa1")} value={discountMode} onChange={(value) => setDiscountMode(value as DiscountMode)} options={discountOptions} />
            {discountMode === "promotion" ? <AdminSelect label={ui("m550ae25c2eee")} value={promotionId} onChange={setPromotionId} placeholder={ui("m40fd0a17c78f")} options={promotions.map((item) => ({ value: item.id, label: item.name, localize: false }))} /> : null}
            {discountMode.startsWith("manual") ? <><label className="text-xs text-foreground-muted">{ui("mcfbd2d59622d")}<input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} className={field}/></label><label className="text-xs text-foreground-muted sm:col-span-2">{ui("mf219cc0614ae")}<input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} className={field}/></label></> : null}
            <AdminSelect label={ui("md19ceca50146")} value={tipMode} onChange={(value) => setTipMode(value as typeof tipMode)} options={[{ value: "none", label: "No tip" }, { value: "percentage", label: "Percentage" }, { value: "fixed", label: "Custom CHF" }]} />
            {tipMode !== "none" ? <label className="text-xs text-foreground-muted">{ui("m7f1581cdfb80")}<input value={tipValue} onChange={(event) => setTipValue(event.target.value)} className={field}/></label> : null}
          </div>
          <div className="border border-border bg-background/30 p-4 text-sm">{[["Subtotal", subtotal], ["Discount", -discount], ["Tax", 0], ["Final total", total], ["Tip", tip], ["Amount to collect", due]].map(([label, value]) => <div key={String(label)} className="flex justify-between py-1.5"><span className="text-foreground-muted">{uiText(label)}</span><span>CHF {Number(value).toFixed(2)}</span></div>)}</div>
          <section>
            <div className="flex items-center justify-between"><h3 className="text-xs uppercase tracking-[.18em] text-foreground-muted">{ui("m207a22aadd3a")}</h3><button type="button" onClick={() => setPayments((current) => [...current, { method: enabledPaymentMethods[0] ?? "cash", amount: "", cashReceived: "" }])} className="min-h-10 text-xs uppercase text-accent">{ui("m0a5b80018435")}</button></div>
            <div className="mt-3 space-y-3">{payments.map((payment, index) => <div key={index} className="grid gap-3 border border-border p-3 sm:grid-cols-3"><AdminSelect label={ui("m0e55fb3b04e2")} value={payment.method} onChange={(value) => update(index, { method: value as PaymentMethodSetting })} options={paymentOptions}/><label className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("mbd3948c0331b")}<input aria-label={ui("mbd3948c0331b")} value={payment.amount} onChange={(event) => update(index, { amount: event.target.value })} placeholder={ui("m43dc8532f7e5")} className={field}/></label>{payment.method === "cash" ? <label className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("m45faa9a65136")}<input aria-label={ui("m45faa9a65136")} value={payment.cashReceived} onChange={(event) => update(index, { cashReceived: event.target.value })} placeholder={ui("m45faa9a65136")} className={field}/></label> : <button type="button" onClick={() => setPayments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="min-h-11 self-end border border-border text-xs uppercase text-foreground-muted">{ui("me963907dac5c")}</button>}</div>)}</div>
            <button type="button" onClick={balanceLast} className="mt-3 min-h-10 text-xs uppercase tracking-[.14em] text-accent">{ui("me546a098124e")}</button>
          </section>
          <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm"><div><span className="text-foreground-muted">{ui("m145caf292855")}</span><p>CHF {due.toFixed(2)}</p></div><div><span className="text-foreground-muted">{ui("mdc9d4584a554")}</span><p>CHF {paid.toFixed(2)}</p></div><div><span className="text-foreground-muted">{ui("m64fbd995d3b6")}</span><p className="text-accent">CHF {change.toFixed(2)}</p></div></div>
          {feedback ? <p className="text-sm text-rose-300">{uiText(feedback)}</p> : null}
        </div>
        <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-border bg-surface p-4 min-[430px]:flex-row min-[430px]:justify-end"><button type="button" onClick={onClose} className="min-h-11 border border-border px-5 text-xs uppercase">{ui("m77dfd2135f4d")}</button><button type="button" disabled={pending || Math.round(paid * 100) !== Math.round(due * 100)} onClick={submit} className="min-h-11 bg-accent px-5 text-xs uppercase text-background disabled:opacity-40">{uiText(pending ? "Completing…" : "Complete Sale")}</button></footer>
      </section>
    </div>
  );
}
