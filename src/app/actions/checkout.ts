"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { getRuntimeSettings } from "@/lib/admin/runtime-settings";
import { calculatePromotionPrice } from "@/lib/promotions/server";
import { getOrCreateReceipt } from "@/lib/receipts/server";
import { processAppointmentStatusForLoyalty } from "@/lib/loyalty/process-completed-appointment";
import type { CheckoutPaymentInput } from "@/lib/sales/types";

const cents = (value: unknown) => Math.round(Number(value) * 100);
const amount = (value: unknown) => cents(value) / 100;

export async function completeCheckout(input: {
  appointmentId: string;
  discountMode: "none" | "existing" | "promotion" | "manual_percentage" | "manual_fixed" | "loyalty";
  promotionId?: string | null;
  loyaltyRewardId?: string | null;
  manualDiscountValue?: number;
  discountReason?: string;
  tipMode: "none" | "percentage" | "fixed";
  tipValue?: number;
  payments: CheckoutPaymentInput[];
  sendReceipt?: boolean;
}) {
  try {
    const { supabase, user } = await requireAdminUser();
    const settings = await getRuntimeSettings();
    const { data: appointment, error: appointmentError } = await supabase.from("appointments").select("id,customer_id,service_id,status,discount_amount,discount_source,discount_type,discount_value,discount_label,promotion_id").eq("id", input.appointmentId).maybeSingle();
    if (appointmentError || !appointment) return { error: "Appointment was not found." };
    const [{ data: service }, { data: existingSale }, { data: existingFinance }] = await Promise.all([
      supabase.from("services").select("id,name,price").eq("id", appointment.service_id).maybeSingle(),
      supabase.from("sales").select("id").eq("appointment_id", appointment.id).maybeSingle(),
      supabase.from("appointment_finance_summary").select("net_paid").eq("appointment_id", appointment.id).maybeSingle(),
    ]);
    if (!service) return { error: "The appointment service was not found." };
    if (existingSale) return { error: "This appointment has already been checked out." };
    if (amount(existingFinance?.net_paid) > 0) return { error: "This appointment already has a recorded payment. Refund or reconcile it before using checkout." };
    const subtotal = amount(service.price);
    let discountAmount = 0;
    let loyaltyDiscount = 0;
    let discountSource: string | null = null;
    let discountType: string | null = null;
    let discountValue: number | null = null;
    let discountReason: string | null = null;
    let loyaltyRewardId: string | null = null;

    if (input.discountMode === "existing" && Number(appointment.discount_amount ?? 0) > 0) {
      const existingAmount = amount(appointment.discount_amount);
      discountSource = appointment.discount_source ?? "manual";
      discountType = appointment.discount_type ?? "fixed";
      discountValue = appointment.discount_value == null ? existingAmount : Number(appointment.discount_value);
      discountReason = appointment.discount_label ?? "Existing discount";
      if (discountSource === "loyalty") {
        loyaltyDiscount = existingAmount;
        const { data: reward } = await supabase.from("loyalty_rewards").select("id").eq("redeemed_appointment_id", appointment.id).maybeSingle();
        loyaltyRewardId = reward?.id ?? null;
      } else discountAmount = existingAmount;
    } else if (input.discountMode === "promotion") {
      const { data: promotion } = input.promotionId ? await supabase.from("promotions").select("id,name,discount_type,discount_value,service_id,is_active,starts_at,expires_at").eq("id", input.promotionId).maybeSingle() : { data: null };
      const now = Date.now();
      if (!promotion?.is_active || (promotion.service_id && promotion.service_id !== service.id) || (promotion.starts_at && new Date(promotion.starts_at).getTime() > now) || (promotion.expires_at && new Date(promotion.expires_at).getTime() <= now)) return { error: "The selected promotion is not available." };
      const calculated = calculatePromotionPrice({ originalPrice: subtotal, discountType: promotion.discount_type, discountValue: Number(promotion.discount_value) });
      discountAmount = calculated.discountAmount; discountSource = "promotion"; discountType = promotion.discount_type; discountValue = Number(promotion.discount_value); discountReason = promotion.name;
    } else if (input.discountMode === "manual_percentage" || input.discountMode === "manual_fixed") {
      const value = Number(input.manualDiscountValue);
      const reason = input.discountReason?.trim();
      if (!reason) return { error: "Enter a reason for the manual discount." };
      if (!Number.isFinite(value) || value <= 0 || (input.discountMode === "manual_percentage" && value > 100)) return { error: "Enter a valid manual discount." };
      const type = input.discountMode === "manual_percentage" ? "percentage" : "fixed";
      const calculated = calculatePromotionPrice({ originalPrice: subtotal, discountType: type, discountValue: value });
      discountAmount = calculated.discountAmount; discountSource = "manual"; discountType = type; discountValue = value; discountReason = reason;
    } else if (input.discountMode === "loyalty") {
      const { data: reward } = input.loyaltyRewardId && appointment.customer_id ? await supabase.from("loyalty_rewards").select("id,reward_type,reward_value,expires_at").eq("id", input.loyaltyRewardId).eq("customer_id", appointment.customer_id).eq("status", "available").maybeSingle() : { data: null };
      if (!reward || (reward.expires_at && new Date(reward.expires_at).getTime() <= Date.now())) return { error: "The loyalty reward is no longer available." };
      const value = Number(reward.reward_value ?? 0);
      loyaltyDiscount = reward.reward_type === "free_service" ? subtotal : reward.reward_type === "percentage" ? Math.min(subtotal, amount(subtotal * Math.min(100, value) / 100)) : Math.min(subtotal, amount(value));
      discountSource = "loyalty"; discountType = reward.reward_type; discountValue = value; discountReason = "Loyalty Reward"; loyaltyRewardId = reward.id;
    }

    const total = amount(Math.max(0, subtotal - discountAmount - loyaltyDiscount));
    const rawTip = input.tipMode === "percentage" ? total * Number(input.tipValue ?? 0) / 100 : input.tipMode === "fixed" ? Number(input.tipValue ?? 0) : 0;
    const tipAmount = amount(Math.max(0, rawTip));
    if (cents(total + tipAmount) > 0 && !input.payments.length) return { error: "Add at least one payment method." };
    const enabled = new Set(settings.finance.enabledPaymentMethods);
    if (input.payments.some((payment) => !enabled.has(payment.method))) return { error: "A selected payment method is disabled." };
    if (input.payments.filter((payment) => payment.method === "cash").length > 1) return { error: "Use a single cash line in a split payment." };
    if (!Number.isFinite(rawTip) || rawTip < 0) return { error: "Enter a valid tip." };
    if (input.payments.some((payment) => !Number.isFinite(payment.amount) || cents(payment.amount) <= 0)) return { error: "Every split payment must be greater than zero." };
    if (cents(input.payments.reduce((sum, payment) => sum + payment.amount, 0)) !== cents(total + tipAmount)) return { error: "Split payments must equal the final total plus tip." };
    const cashPayment = input.payments.find((payment) => payment.method === "cash");
    if (cashPayment) {
      const { data: register } = await supabase.from("register_sessions").select("id").eq("status", "open").limit(1).maybeSingle();
      if (!register) return { error: "Open the cash register before accepting cash." };
      if (Number(cashPayment.cashReceived ?? cashPayment.amount) < cashPayment.amount) return { error: "Cash received cannot be less than the cash payment." };
    }
    let remainingTipCents = cents(tipAmount);
    const paymentPayload = input.payments.map((payment, index) => {
      const tipCents = index === input.payments.length - 1 ? remainingTipCents : 0;
      remainingTipCents -= tipCents;
      const received = payment.method === "cash" ? amount(payment.cashReceived ?? payment.amount) : null;
      return { method: payment.method, amount: amount(payment.amount), tipAmount: tipCents / 100, cashReceived: received, changeGiven: received == null ? null : amount(received - payment.amount) };
    });
    const { data: saleId, error } = await supabase.rpc("complete_pos_checkout", { p_appointment_id: appointment.id, p_subtotal: subtotal, p_discount_amount: discountAmount, p_discount_source: discountSource, p_discount_type: discountType, p_discount_value: discountValue, p_discount_reason: discountReason, p_loyalty_reward_id: loyaltyRewardId, p_loyalty_discount: loyaltyDiscount, p_tip_amount: tipAmount, p_tax_amount: 0, p_total: total, p_payments: paymentPayload });
    if (error || !saleId) return { error: error?.message ?? "Checkout could not be completed." };
    await processAppointmentStatusForLoyalty(appointment.id);
    let receipt = null;
    if (settings.finance.autoGenerateReceipt || input.sendReceipt) receipt = await getOrCreateReceipt(supabase, appointment.id, user.id);
    ["/admin/appointments","/admin/finance","/admin/finance/sales","/admin/finance/register","/admin"].forEach((path) => revalidatePath(path));
    return { error: null, saleId: String(saleId), receiptId: receipt?.id ?? null, change: cashPayment ? amount(Number(cashPayment.cashReceived ?? cashPayment.amount) - cashPayment.amount) : 0 };
  } catch (error) {
    console.error("CHECKOUT ERROR", error);
    return { error: error instanceof Error ? error.message : "Checkout could not be completed." };
  }
}
