import type { PaymentMethod } from "@/lib/finance/types";

export type CheckoutPaymentInput = { method: PaymentMethod; amount: number; cashReceived?: number };
export type SaleRecord = {
  id: string; sale_number: number | string; appointment_id: string; customer_id: string | null;
  subtotal: number | string; discount_amount: number | string; discount_source: string | null;
  discount_type: string | null; discount_value: number | string | null; discount_reason: string | null;
  loyalty_reward_id: string | null; loyalty_discount: number | string; tip_amount: number | string;
  tax_amount: number | string; total: number | string; status: "completed" | "partially_refunded" | "refunded";
  completed_at: string; created_by: string; created_at: string; updated_at: string;
};

export type SaleListItem = {
  id: string; saleNumber: number; appointmentId: string; bookingReference: string;
  customerName: string; serviceName: string; completedAt: string; subtotal: number;
  discount: number; loyaltyDiscount: number; tip: number; tax: number; total: number;
  refunded: number; status: string; paymentBreakdown: Array<{ method: PaymentMethod; amount: number }>;
  receiptId: string | null;
};

export type AppointmentSaleLink = {
  id: string;
  appointment_id: string;
  status: SaleRecord["status"];
  refundableAmount: number;
};
