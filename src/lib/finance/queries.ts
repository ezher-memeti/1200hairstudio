import { requireAdminUser } from "@/lib/auth/customer";
import type { CustomerRecord } from "@/lib/customers/types";
import type { ServiceRecord } from "@/lib/services/types";
import type {
  AppointmentFinanceSummary,
  FinanceAppointment,
  FinanceTransaction,
} from "@/lib/finance/types";
import type { FinancePromotion } from "@/lib/finance/types";
import type { ReceiptRecord } from "@/lib/receipts/types";
import type { FinancialReportRecord } from "@/lib/finance/report-types";
import { normalizeFinancialReportRecord } from "@/lib/finance/reports";

const numberValue = (value: number | string | null | undefined) => Number(value ?? 0);

export async function getAdminFinanceData() {
  const { supabase } = await requireAdminUser();
  const [{ data: summaries, error: summaryError }, { data: payments, error: paymentError }, { data: promotions, error: promotionError }, { data: receipts, error: receiptError }, { data: reports, error: reportError }] =
    await Promise.all([
      supabase.from("appointment_finance_summary").select("*").order("start_at", { ascending: false }),
      supabase.from("payments").select("*").order("paid_at", { ascending: false }),
      supabase.from("promotions").select("id,name,discount_type,discount_value,service_id,starts_at,expires_at,is_active").order("name"),
      supabase.from("receipts").select("*").order("issued_at", { ascending: false }),
      supabase.from("financial_reports").select("*").order("generated_at", { ascending: false }),
    ]);

  if (summaryError) throw new Error(`Unable to load appointment finance: ${summaryError.message}`);
  if (paymentError) throw new Error(`Unable to load payments: ${paymentError.message}`);
  if (promotionError) throw new Error(`Unable to load promotions: ${promotionError.message}`);
  if (receiptError) throw new Error(`Unable to load receipts: ${receiptError.message}`);
  if (reportError) throw new Error(`Unable to load financial reports: ${reportError.message}`);

  const financeRows = (summaries ?? []) as AppointmentFinanceSummary[];
  const customerIds = [...new Set(financeRows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const serviceIds = [...new Set(financeRows.map((row) => row.service_id).filter(Boolean))];
  const appointmentIds = financeRows.map((row) => row.appointment_id);
  const [{ data: customers }, { data: services }, { data: appointmentRows }] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("*").in("id", customerIds) : Promise.resolve({ data: [] }),
    serviceIds.length ? supabase.from("services").select("*").in("id", serviceIds) : Promise.resolve({ data: [] }),
    appointmentIds.length
      ? supabase.from("appointments").select("id, customer_name, guest_name, promotion_id, discount_source, discount_label, discount_type, discount_value").in("id", appointmentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const customersById = new Map(((customers ?? []) as CustomerRecord[]).map((row) => [row.id, row]));
  const servicesById = new Map(((services ?? []) as ServiceRecord[]).map((row) => [row.id, row]));
  const summariesById = new Map(financeRows.map((row) => [row.appointment_id, row]));
  const appointmentNames = new Map(
    (appointmentRows ?? []).map((row) => [row.id, row.customer_name ?? row.guest_name ?? "Guest"]),
  );
  const appointmentPromotions = new Map(
    (appointmentRows ?? []).map((row) => [row.id, row.promotion_id ?? null]),
  );
  const appointmentDiscounts = new Map((appointmentRows ?? []).map((row) => [row.id, row]));

  const appointments: FinanceAppointment[] = financeRows.map((row) => ({
    appointmentId: row.appointment_id,
    bookingReference: row.booking_reference ?? "No reference",
    customerName: (row.customer_id ? customersById.get(row.customer_id)?.full_name : null) ?? appointmentNames.get(row.appointment_id) ?? "Guest",
    serviceId: row.service_id,
    serviceName: servicesById.get(row.service_id)?.name ?? "Service",
    startAt: row.start_at,
    appointmentStatus: row.appointment_status,
    originalPrice: numberValue(row.original_price),
    amountDue: numberValue(row.amount_due),
    discountAmount: numberValue(row.discount_amount),
    promotionId: appointmentPromotions.get(row.appointment_id) ?? null,
    discountSource: appointmentDiscounts.get(row.appointment_id)?.discount_source ?? null,
    discountLabel: appointmentDiscounts.get(row.appointment_id)?.discount_label ?? null,
    discountType: appointmentDiscounts.get(row.appointment_id)?.discount_type ?? null,
    discountValue: appointmentDiscounts.get(row.appointment_id)?.discount_value == null ? null : Number(appointmentDiscounts.get(row.appointment_id)?.discount_value),
    totalPaid: numberValue(row.total_paid),
    totalRefunded: numberValue(row.total_refunded),
    netPaid: numberValue(row.net_paid),
    paymentStatus: row.payment_status ?? "unpaid",
  }));

  const transactions: FinanceTransaction[] = (payments ?? []).map((payment) => {
    const summary = summariesById.get(payment.appointment_id);
    return {
      id: payment.id,
      appointment_id: payment.appointment_id,
      transaction_type: payment.transaction_type,
      amount: numberValue(payment.amount),
      currency: payment.currency ?? "CHF",
      payment_method: payment.payment_method,
      status: payment.status,
      paid_at: payment.paid_at,
      notes: payment.notes,
      created_at: payment.created_at,
      booking_reference: summary?.booking_reference ?? "No reference",
      customer_name: summary?.customer_id ? customersById.get(summary.customer_id)?.full_name ?? "Customer" : appointmentNames.get(payment.appointment_id) ?? "Guest",
      service_id: summary?.service_id ?? "",
      service_name: summary ? servicesById.get(summary.service_id)?.name ?? "Service" : "Service",
      appointment_status: summary?.appointment_status ?? "Unknown",
    };
  });

  return {
    transactions,
    appointments,
    services: [...servicesById.values()],
    promotions: ((promotions ?? []) as FinancePromotion[]).map((promotion) => ({
      ...promotion,
      discount_value: Number(promotion.discount_value),
    })),
    receipts: ((receipts ?? []) as ReceiptRecord[]).map((receipt) => ({
      ...receipt,
      receipt_number: Number(receipt.receipt_number),
      subtotal: numberValue(receipt.subtotal),
      discount_amount: numberValue(receipt.discount_amount),
      total: numberValue(receipt.total),
      amount_paid: numberValue(receipt.amount_paid),
      balance: numberValue(receipt.balance),
    })),
    reports: ((reports ?? []) as FinancialReportRecord[]).map(normalizeFinancialReportRecord),
  };
}

export async function getAppointmentFinanceSummaries(appointmentIds: string[]) {
  if (!appointmentIds.length) return [] as AppointmentFinanceSummary[];
  const { supabase } = await requireAdminUser();
  const { data, error } = await supabase
    .from("appointment_finance_summary")
    .select("*")
    .in("appointment_id", appointmentIds);
  if (error) throw new Error(`Unable to load appointment finance: ${error.message}`);
  return (data ?? []) as AppointmentFinanceSummary[];
}

export async function getAppointmentReceipts(appointmentIds: string[]) {
  if (!appointmentIds.length) return [] as ReceiptRecord[];
  const { supabase } = await requireAdminUser();
  const { data, error } = await supabase.from("receipts").select("*").in("appointment_id", appointmentIds);
  if (error) throw new Error(`Unable to load appointment receipts: ${error.message}`);
  return ((data ?? []) as ReceiptRecord[]).map((receipt) => ({
    ...receipt,
    receipt_number: Number(receipt.receipt_number),
    subtotal: numberValue(receipt.subtotal),
    discount_amount: numberValue(receipt.discount_amount),
    total: numberValue(receipt.total),
    amount_paid: numberValue(receipt.amount_paid),
    balance: numberValue(receipt.balance),
  }));
}

export async function getAdminFinancePromotions() {
  const { supabase } = await requireAdminUser();
  const { data, error } = await supabase
    .from("promotions")
    .select("id,name,discount_type,discount_value,service_id,starts_at,expires_at,is_active")
    .order("name");
  if (error) throw new Error(`Unable to load promotions: ${error.message}`);
  return ((data ?? []) as FinancePromotion[]).map((promotion) => ({
    ...promotion,
    discount_value: Number(promotion.discount_value),
  }));
}
