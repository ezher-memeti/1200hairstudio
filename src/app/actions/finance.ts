"use server";

import { revalidatePath } from "next/cache";
import { getUtcIsoForZurichDateTime } from "@/lib/appointments/availability";
import { requireAdminUser } from "@/lib/auth/customer";
import type { AppointmentDiscountMode, PaymentMethod, TransactionType } from "@/lib/finance/types";
import { calculatePromotionPrice } from "@/lib/promotions/server";
import { generateReceiptPdf, getAdminReceipt, getOrCreateReceipt } from "@/lib/receipts/server";
import { sendReceiptEmail } from "@/lib/email/receipt";
import { getRuntimeSettings } from "@/lib/admin/runtime-settings";
import type { FinanceSettings } from "@/lib/admin/settings";

const paymentMethods = new Set<PaymentMethod>(["cash", "twint", "card", "bank_transfer", "other"]);

async function finalizeReceipt(
  supabase: Awaited<ReturnType<typeof requireAdminUser>>["supabase"],
  userId: string,
  appointmentId: string,
  sendEmail: boolean,
  financeSettings: FinanceSettings,
) {
  const { data: finance } = await supabase
    .from("appointment_finance_summary")
    .select("amount_due,net_paid")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (!finance || Number(finance.net_paid ?? 0) < Number(finance.amount_due ?? 0)) {
    return { receiptId: null, receiptNumber: null, receiptEmailStatus: "skipped" as const, receiptEmailWarning: null };
  }

  if (!financeSettings.autoGenerateReceipt && !sendEmail) {
    return { receiptId: null, receiptNumber: null, receiptEmailStatus: "skipped" as const, receiptEmailWarning: null };
  }
  const receipt = await getOrCreateReceipt(supabase, appointmentId, userId);
  if (!sendEmail) return { receiptId: receipt.id, receiptNumber: receipt.receipt_number, receiptEmailStatus: "skipped" as const, receiptEmailWarning: null };
  try {
    const detailedReceipt = await getAdminReceipt(supabase, receipt.id);
    if (!detailedReceipt?.customer_email) {
      return { receiptId: receipt.id, receiptNumber: receipt.receipt_number, receiptEmailStatus: "skipped" as const, receiptEmailWarning: "Receipt created, but the customer has no email address." };
    }
    await sendReceiptEmail({ to: detailedReceipt.customer_email, customerId: detailedReceipt.customer_id, customerName: detailedReceipt.customer_name, receipt, pdf: await generateReceiptPdf(receipt) });
    const emailedAt = new Date().toISOString();
    const { error } = await supabase.from("receipts").update({ emailed_at: emailedAt }).eq("id", receipt.id);
    if (error) console.error("RECEIPT EMAILED_AT UPDATE ERROR", error);
    return { receiptId: receipt.id, receiptNumber: receipt.receipt_number, receiptEmailStatus: "sent" as const, receiptEmailWarning: null };
  } catch (error) {
    console.error("RECEIPT EMAIL ERROR", error);
    return { receiptId: receipt.id, receiptNumber: receipt.receipt_number, receiptEmailStatus: "failed" as const, receiptEmailWarning: "Payment succeeded and the receipt was created, but the email could not be sent." };
  }
}

export async function recordAdminTransaction(input: {
  appointmentId: string;
  transactionType: TransactionType;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  notes?: string;
  promotionId?: string | null;
  discountMode?: AppointmentDiscountMode;
  customDiscountLabel?: string;
  customDiscountType?: "percentage" | "fixed";
  customDiscountValue?: number;
  sendReceipt?: boolean;
}) {
  try {
    const { supabase, user } = await requireAdminUser();
    const settings = await getRuntimeSettings();
    let previousPriceSnapshot: { promotion_id: string | null; original_price: number | null; discount_amount: number | null; final_price: number | null; discount_source: string | null; discount_label: string | null; discount_type: string | null; discount_value: number | null } | null = null;
    const amount = Number(input.amount);
    if (!input.appointmentId || !Number.isFinite(amount) || amount < 0) return { error: "Enter a valid payment amount." };
    if (input.transactionType !== "payment" && input.transactionType !== "refund") return { error: "Invalid transaction type." };
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(input.paidAt);
    if (input.transactionType === "refund" && amount <= 0) return { error: "Enter a valid refund amount greater than zero." };

    const { data: finance, error: financeError } = await supabase
      .from("appointment_finance_summary")
      .select("appointment_id, service_id, amount_due, net_paid")
      .eq("appointment_id", input.appointmentId)
      .maybeSingle();
    if (financeError || !finance) return { error: "Appointment finance record was not found." };
    if (input.transactionType === "refund" && amount > Number(finance.net_paid ?? 0)) {
      return { error: "Refund cannot exceed the appointment's current net paid amount." };
    }

    if (input.transactionType === "payment") {
      const [{ data: appointment, error: appointmentError }, { data: service, error: serviceError }] = await Promise.all([
        supabase.from("appointments").select("id,promotion_id,original_price,discount_amount,final_price,discount_source,discount_label,discount_type,discount_value").eq("id", finance.appointment_id).maybeSingle(),
        supabase.from("services").select("id,price").eq("id", finance.service_id).maybeSingle(),
      ]);
      if (appointmentError || !appointment || serviceError || !service) return { error: "Appointment pricing could not be verified." };
      const originalPrice = Number(service.price);
      let promotionId: string | null = null;
      let discountAmount = 0;
      let finalPrice = originalPrice;
      let discountSource: "promotion" | "custom" | null = null;
      let discountLabel: string | null = null;
      let discountType: "percentage" | "fixed" | null = null;
      let discountValue: number | null = null;
      const discountMode = input.discountMode ?? (appointment.discount_source === "custom" ? "custom" : appointment.discount_source === "promotion" || appointment.promotion_id ? "promotion" : "none");

      if (discountMode === "promotion" && input.promotionId && input.promotionId === appointment.promotion_id && appointment.discount_source === "promotion") {
        promotionId = appointment.promotion_id;
        discountAmount = Number(appointment.discount_amount ?? 0);
        finalPrice = Number(appointment.final_price ?? originalPrice - discountAmount);
        discountSource = "promotion";
        discountLabel = appointment.discount_label;
        discountType = appointment.discount_type;
        discountValue = appointment.discount_value == null ? null : Number(appointment.discount_value);
      } else if (discountMode === "promotion" && input.promotionId) {
        const { data: promotion, error: promotionError } = await supabase
          .from("promotions")
          .select("id,name,discount_type,discount_value")
          .eq("id", input.promotionId)
          .maybeSingle();
        const invalid = promotionError || !promotion || !["percentage", "fixed"].includes(promotion.discount_type) ||
          Number(promotion.discount_value) <= 0 ||
          (promotion.discount_type === "percentage" && Number(promotion.discount_value) > 100);
        if (invalid) return { error: "The selected promotion has an invalid discount configuration." };
        const calculated = calculatePromotionPrice({ originalPrice, discountType: promotion.discount_type, discountValue: Number(promotion.discount_value) });
        promotionId = promotion.id;
        discountAmount = calculated.discountAmount;
        finalPrice = calculated.finalPrice;
        discountSource = "promotion";
        discountLabel = promotion.name;
        discountType = promotion.discount_type;
        discountValue = Number(promotion.discount_value);
      } else if (discountMode === "custom") {
        const label = input.customDiscountLabel?.trim();
        const type = input.customDiscountType;
        const value = Number(input.customDiscountValue);
        if (!label) return { error: "Enter a label for the custom discount." };
        if (type !== "percentage" && type !== "fixed") return { error: "Choose a valid custom discount type." };
        if (!Number.isFinite(value) || value <= 0) return { error: "Discount value must be greater than zero." };
        if (type === "percentage" && value > 100) return { error: "Percentage discount cannot exceed 100%." };
        if (type === "fixed" && value > originalPrice) return { error: "Fixed discount cannot exceed the service price." };
        const calculated = calculatePromotionPrice({ originalPrice, discountType: type, discountValue: value });
        discountAmount = calculated.discountAmount;
        finalPrice = calculated.finalPrice;
        discountSource = "custom";
        discountLabel = label;
        discountType = type;
        discountValue = value;
      } else if (discountMode !== "none") {
        return { error: "Choose a valid discount option." };
      }
      if (finalPrice < Number(finance.net_paid ?? 0)) return { error: `This discount cannot be applied because the appointment has already received CHF ${Number(finance.net_paid ?? 0).toFixed(2)} in payments.` };
      const remainingBalance = Math.max(0, finalPrice - Number(finance.net_paid ?? 0));
      if (remainingBalance > 0 && amount <= 0) return { error: "Enter a valid amount greater than zero." };
      if (amount > remainingBalance) return { error: "Payment cannot exceed the remaining appointment balance." };
      if (remainingBalance > 0 && (!paymentMethods.has(input.paymentMethod) || !settings.finance.enabledPaymentMethods.includes(input.paymentMethod))) return { error: "This payment method is currently disabled." };
      if (remainingBalance > 0 && !match) return { error: "Choose a valid paid date and time." };

      previousPriceSnapshot = {
        promotion_id: appointment.promotion_id ?? null,
        original_price: appointment.original_price == null ? null : Number(appointment.original_price),
        discount_amount: appointment.discount_amount == null ? null : Number(appointment.discount_amount),
        final_price: appointment.final_price == null ? null : Number(appointment.final_price),
        discount_source: appointment.discount_source,
        discount_label: appointment.discount_label,
        discount_type: appointment.discount_type,
        discount_value: appointment.discount_value == null ? null : Number(appointment.discount_value),
      };
      const { data: updatedAppointment, error: priceError } = await supabase
        .from("appointments")
        .update({ promotion_id: promotionId, original_price: originalPrice, discount_amount: discountAmount, final_price: finalPrice, discount_source: discountSource, discount_label: discountLabel, discount_type: discountType, discount_value: discountValue, updated_at: new Date().toISOString() })
        .eq("id", finance.appointment_id)
        .select("id")
        .maybeSingle();
      if (priceError || !updatedAppointment) {
        console.error("ADMIN APPOINTMENT PRICE SNAPSHOT ERROR", priceError);
        return { error: "The appointment price could not be updated." };
      }

      if (remainingBalance === 0) {
        const sendReceipt = input.sendReceipt === true && settings.notifications.receiptEmailEnabled;
        const receiptResult = await finalizeReceipt(supabase, user.id, finance.appointment_id, sendReceipt, settings.finance);
        revalidatePath("/admin/finance");
        revalidatePath("/admin/appointments");
        revalidatePath("/admin/calendar");
        return { error: null, paymentCreated: false, discountSaved: true, ...receiptResult };
      }
    }

    if (!paymentMethods.has(input.paymentMethod) || !settings.finance.enabledPaymentMethods.includes(input.paymentMethod)) return { error: "This payment method is currently disabled." };
    if (!match) return { error: "Choose a valid paid date and time." };

    const { error } = await supabase.from("payments").insert({
      appointment_id: finance.appointment_id,
      transaction_type: input.transactionType,
      amount: Math.round(amount * 100) / 100,
      currency: "CHF",
      payment_method: input.paymentMethod,
      status: "completed",
      paid_at: getUtcIsoForZurichDateTime(match[1], match[2]),
      notes: input.notes?.trim() || null,
      created_by: user.id,
    });
    if (error) {
      console.error("ADMIN FINANCE TRANSACTION ERROR", error);
      if (previousPriceSnapshot) {
        const { error: rollbackError } = await supabase
          .from("appointments")
          .update({ ...previousPriceSnapshot, updated_at: new Date().toISOString() })
          .eq("id", finance.appointment_id);
        if (rollbackError) console.error("ADMIN APPOINTMENT PRICE SNAPSHOT ROLLBACK ERROR", rollbackError);
      }
      return { error: "The transaction could not be recorded." };
    }

    const receiptResult = input.transactionType === "payment"
      ? await finalizeReceipt(supabase, user.id, finance.appointment_id, input.sendReceipt === true && settings.notifications.receiptEmailEnabled, settings.finance)
      : { receiptId: null, receiptNumber: null, receiptEmailStatus: "skipped" as const, receiptEmailWarning: null };

    revalidatePath("/admin/finance");
    revalidatePath("/admin/appointments");
    revalidatePath("/admin/calendar");
    return { error: null, paymentCreated: true, discountSaved: input.transactionType === "payment", ...receiptResult };
  } catch (error) {
    console.error("ADMIN FINANCE ACTION ERROR", error);
    return { error: "The transaction could not be recorded." };
  }
}

export async function resendAdminReceipt(receiptId: string) {
  try {
    const { supabase } = await requireAdminUser();
    const receipt = await getAdminReceipt(supabase, receiptId);
    if (!receipt) return { error: "Receipt not found." };
    if (!receipt.customer_email) return { error: "This customer does not have an email address." };
    await sendReceiptEmail({ to: receipt.customer_email, customerId: receipt.customer_id, customerName: receipt.customer_name, receipt, pdf: await generateReceiptPdf(receipt) });
    const emailedAt = new Date().toISOString();
    const { error } = await supabase.from("receipts").update({ emailed_at: emailedAt }).eq("id", receipt.id);
    if (error) return { error: "Receipt was sent, but its email status could not be updated." };
    revalidatePath("/admin/finance");
    revalidatePath("/admin/appointments");
    return { error: null, emailedAt };
  } catch (error) {
    console.error("ADMIN RECEIPT RESEND ERROR", error);
    return { error: "The receipt email could not be sent." };
  }
}

export async function generateAdminReceiptForAppointment(appointmentId: string) {
  try {
    if (!appointmentId) return { error: "Appointment not found.", receipt: null };
    const { supabase, user } = await requireAdminUser();
    const receipt = await getOrCreateReceipt(supabase, appointmentId, user.id);
    revalidatePath("/admin/finance");
    revalidatePath("/admin/appointments");
    return { error: null, receipt };
  } catch (error) {
    console.error("ADMIN RECEIPT GENERATION ERROR", error);
    return { error: error instanceof Error ? error.message : "The receipt could not be generated.", receipt: null };
  }
}
