import "server-only";
import { requireAdminUser } from "@/lib/auth/customer";
import type { PaymentMethod } from "@/lib/finance/types";
import type { AppointmentSaleLink, SaleListItem, SaleRecord } from "@/lib/sales/types";

const value = (input: unknown) => Math.round(Number(input ?? 0) * 100) / 100;

export async function getAppointmentSaleLinks(appointmentIds: string[]): Promise<AppointmentSaleLink[]> {
  if (!appointmentIds.length) return [];
  const { supabase } = await requireAdminUser();
  const { data: saleRows, error } = await supabase
    .from("sales")
    .select("id,appointment_id,status")
    .in("appointment_id", appointmentIds);
  if (error) throw new Error("Appointment checkout status could not be loaded.");
  const sales = (saleRows ?? []) as Array<Pick<SaleRecord, "id" | "appointment_id" | "status">>;
  if (!sales.length) return [];
  const { data: paymentRows, error: paymentError } = await supabase
    .from("payments")
    .select("sale_id,transaction_type,amount,status")
    .in("sale_id", sales.map((sale) => sale.id))
    .eq("status", "completed");
  if (paymentError) throw new Error("Appointment refundable balances could not be loaded.");
  const refundableBySale = new Map<string, number>();
  for (const payment of paymentRows ?? []) {
    if (!payment.sale_id) continue;
    const direction = payment.transaction_type === "refund" ? -1 : 1;
    refundableBySale.set(
      payment.sale_id,
      value(refundableBySale.get(payment.sale_id)) + direction * value(payment.amount),
    );
  }
  return sales.map((sale) => ({
    ...sale,
    refundableAmount: Math.max(0, value(refundableBySale.get(sale.id))),
  }));
}

export async function getAdminSales(): Promise<SaleListItem[]> {
  const { supabase } = await requireAdminUser();
  const { data: saleRows, error } = await supabase.from("sales").select("*").order("completed_at", { ascending: false });
  if (error) throw new Error("Sales could not be loaded.");
  const sales = (saleRows ?? []) as SaleRecord[];
  const appointmentIds = sales.map((sale) => sale.appointment_id);
  const saleIds = sales.map((sale) => sale.id);
  const [{ data: appointments }, { data: payments }, { data: receipts }] = await Promise.all([
    appointmentIds.length ? supabase.from("appointments").select("id,booking_reference,customer_id,customer_name,guest_name,service_id").in("id", appointmentIds) : Promise.resolve({ data: [] }),
    saleIds.length ? supabase.from("payments").select("sale_id,transaction_type,amount,payment_method,status").in("sale_id", saleIds).eq("status", "completed") : Promise.resolve({ data: [] }),
    appointmentIds.length ? supabase.from("receipts").select("id,appointment_id").in("appointment_id", appointmentIds) : Promise.resolve({ data: [] }),
  ]);
  const serviceIds = [...new Set((appointments ?? []).map((item) => item.service_id))];
  const customerIds = [...new Set((appointments ?? []).map((item) => item.customer_id).filter(Boolean))];
  const [{ data: services }, { data: customers }] = await Promise.all([
    serviceIds.length ? supabase.from("services").select("id,name").in("id", serviceIds) : Promise.resolve({ data: [] }),
    customerIds.length ? supabase.from("customers").select("id,full_name").in("id", customerIds) : Promise.resolve({ data: [] }),
  ]);
  const appointmentMap = new Map((appointments ?? []).map((item) => [item.id, item]));
  const serviceMap = new Map((services ?? []).map((item) => [item.id, item.name]));
  const customerMap = new Map((customers ?? []).map((item) => [item.id, item.full_name]));
  const receiptMap = new Map((receipts ?? []).map((item) => [item.appointment_id, item.id]));
  return sales.map((sale) => {
    const appointment = appointmentMap.get(sale.appointment_id);
    const transactions = (payments ?? []).filter((payment) => payment.sale_id === sale.id);
    const paymentBreakdown = [...transactions.filter((item) => item.transaction_type === "payment").reduce((map, item) => map.set(item.payment_method as PaymentMethod, value(map.get(item.payment_method as PaymentMethod)) + value(item.amount)), new Map<PaymentMethod, number>())].map(([method, amount]) => ({ method, amount }));
    return { id: sale.id, saleNumber: Number(sale.sale_number), appointmentId: sale.appointment_id, bookingReference: appointment?.booking_reference ?? "—", customerName: customerMap.get(appointment?.customer_id ?? "") ?? appointment?.customer_name ?? appointment?.guest_name ?? "Customer", serviceName: serviceMap.get(appointment?.service_id ?? "") ?? "Service", completedAt: sale.completed_at, subtotal: value(sale.subtotal), discount: value(sale.discount_amount), loyaltyDiscount: value(sale.loyalty_discount), tip: value(sale.tip_amount), tax: value(sale.tax_amount), total: value(sale.total), refunded: transactions.filter((item) => item.transaction_type === "refund").reduce((sum,item)=>sum+value(item.amount),0), status: sale.status, paymentBreakdown, receiptId: receiptMap.get(sale.appointment_id) ?? null };
  });
}
