import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminReceipt, ReceiptRecord } from "@/lib/receipts/types";
import { getFinanceSettings } from "@/lib/admin/runtime-settings";

const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;

export async function getOrCreateReceipt(
  supabase: SupabaseClient,
  appointmentId: string,
  createdBy: string,
) {
  const existing = await supabase.from("receipts").select("*").eq("appointment_id", appointmentId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as ReceiptRecord;

  const [{ data: appointment, error: appointmentError }, { data: finance, error: financeError }, { data: payments, error: paymentsError }, financeSettings] = await Promise.all([
    supabase.from("appointments").select("id,customer_id,customer_name,guest_name,service_id,start_at,discount_label").eq("id", appointmentId).maybeSingle(),
    supabase.from("appointment_finance_summary").select("appointment_id,original_price,discount_amount,amount_due,net_paid").eq("appointment_id", appointmentId).maybeSingle(),
    supabase.from("payments").select("transaction_type,amount,payment_method,status,paid_at").eq("appointment_id", appointmentId).eq("status", "completed").order("paid_at"),
    getFinanceSettings(),
  ]);
  if (appointmentError || !appointment || financeError || !finance || paymentsError) throw new Error("Receipt data could not be loaded.");

  const total = money(finance.amount_due);
  const amountPaid = money(finance.net_paid);
  const balance = Math.max(0, money(total - amountPaid));
  if (balance > 0) throw new Error("A receipt can only be issued after the appointment balance is settled.");

  const [{ data: customer }, { data: service }, { data: latestReceipt }] = await Promise.all([
    appointment.customer_id ? supabase.from("customers").select("full_name,email").eq("id", appointment.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("services").select("name").eq("id", appointment.service_id).maybeSingle(),
    supabase.from("receipts").select("receipt_number").order("receipt_number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!service?.name) throw new Error("Receipt service snapshot could not be created.");
  const methods = [...new Set((payments ?? []).filter((payment) => payment.transaction_type === "payment").map((payment) => payment.payment_method).filter(Boolean))];
  const payload = {
    appointment_id: appointment.id,
    receipt_number: Number(latestReceipt?.receipt_number ?? 1000) + 1,
    customer_name: customer?.full_name ?? appointment.customer_name ?? appointment.guest_name ?? "Customer",
    service_name: service.name,
    service_quantity: 1,
    appointment_start_at: appointment.start_at,
    subtotal: money(finance.original_price),
    discount_amount: money(finance.discount_amount),
    discount_label: appointment.discount_label ?? null,
    total,
    amount_paid: amountPaid,
    balance,
    payment_method: methods.length ? methods.join(" + ") : null,
    currency: financeSettings.currency,
    issued_at: new Date().toISOString(),
    created_by: createdBy,
  };

  const inserted = await supabase.from("receipts").insert(payload).select("*").maybeSingle();
  if (!inserted.error && inserted.data) return inserted.data as ReceiptRecord;
  if (inserted.error?.code === "23505") {
    const raced = await supabase.from("receipts").select("*").eq("appointment_id", appointmentId).maybeSingle();
    if (raced.data) return raced.data as ReceiptRecord;
  }
  throw inserted.error ?? new Error("Receipt could not be created.");
}

export async function getAdminReceipt(supabase: SupabaseClient, receiptId: string): Promise<AdminReceipt | null> {
  const { data: receipt, error } = await supabase.from("receipts").select("*").eq("id", receiptId).maybeSingle();
  if (error || !receipt) return null;
  const { data: appointment } = await supabase.from("appointments").select("customer_id,customer_email,guest_email").eq("id", receipt.appointment_id).maybeSingle();
  const { data: customer } = appointment?.customer_id ? await supabase.from("customers").select("email").eq("id", appointment.customer_id).maybeSingle() : { data: null };
  return { ...(receipt as ReceiptRecord), customer_email: customer?.email ?? appointment?.customer_email ?? appointment?.guest_email ?? "" };
}

function drawRight(page: PDFPage, font: PDFFont, text: string, y: number, size = 10) {
  page.drawText(text, { x: 535 - font.widthOfTextAtSize(text, size), y, size, font, color: rgb(0.1, 0.1, 0.1) });
}

export async function generateReceiptPdf(receipt: ReceiptRecord) {
  const currency = receipt.currency || "CHF";
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.97, 0.96, 0.93) });
  page.drawText("1200", { x: 60, y: 755, size: 34, font: bold, color: rgb(0.08, 0.08, 0.07) });
  page.drawText("H A I R S T U D I O", { x: 62, y: 735, size: 8, font: regular, color: rgb(0.35, 0.33, 0.29) });
  page.drawText("Schulstrasse 2", { x: 60, y: 700, size: 10, font: regular });
  page.drawText("8599 Salmsach, Thurgau", { x: 60, y: 684, size: 10, font: regular });
  drawRight(page, bold, `BELEG ${receipt.receipt_number}`, 755, 15);
  drawRight(page, regular, new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium" }).format(new Date(receipt.issued_at)), 735, 9);
  page.drawLine({ start: { x: 60, y: 650 }, end: { x: 535, y: 650 }, thickness: 1, color: rgb(0.76, 0.69, 0.57) });
  page.drawText("CUSTOMER", { x: 60, y: 620, size: 8, font: bold, color: rgb(0.45, 0.4, 0.32) });
  page.drawText(receipt.customer_name ?? "Customer", { x: 60, y: 596, size: 14, font: regular });
  page.drawText(`${receipt.service_quantity} × ${receipt.service_name}`, { x: 60, y: 535, size: 12, font: bold });
  drawRight(page, regular, `${currency} ${receipt.subtotal.toFixed(2)}`, 535, 11);
  page.drawText(new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(receipt.appointment_start_at)), { x: 60, y: 515, size: 9, font: regular, color: rgb(0.4, 0.4, 0.38) });
  page.drawLine({ start: { x: 60, y: 480 }, end: { x: 535, y: 480 }, thickness: 0.6, color: rgb(0.78, 0.76, 0.72) });
  const rows: Array<[string, string, boolean?]> = [
    ["Subtotal", `${currency} ${receipt.subtotal.toFixed(2)}`],
    [receipt.discount_label ? `Discount · ${receipt.discount_label}` : "Discount", `-${currency} ${receipt.discount_amount.toFixed(2)}`],
    ["Total", `${currency} ${receipt.total.toFixed(2)}`, true],
    [receipt.payment_method ? `Payment with ${receipt.payment_method.toUpperCase()}` : "No payment required", `${currency} ${receipt.amount_paid.toFixed(2)}`],
    ["Balance", `${currency} ${receipt.balance.toFixed(2)}`, true],
  ];
  rows.forEach(([label, value, strong], index) => {
    const y = 445 - index * 34;
    page.drawText(label, { x: 60, y, size: strong ? 11 : 10, font: strong ? bold : regular });
    drawRight(page, strong ? bold : regular, value, y, strong ? 11 : 10);
  });
  page.drawText("Vielen Dank für Ihren Besuch.", { x: 60, y: 210, size: 12, font: regular, color: rgb(0.25, 0.23, 0.2) });
  return document.save();
}
