export type TransactionType = "payment" | "refund";
export type AppointmentDiscountMode = "none" | "promotion" | "custom";
export type PaymentMethod = "cash" | "twint" | "card" | "bank_transfer" | "other";
export type PaymentStatus = "pending" | "completed" | "failed" | "voided";

export type AppointmentFinanceSummary = {
  appointment_id: string;
  booking_reference: string | null;
  customer_id: string | null;
  service_id: string;
  start_at: string;
  end_at: string;
  appointment_status: string;
  original_price: number | string | null;
  discount_amount: number | string | null;
  amount_due: number | string | null;
  total_paid: number | string | null;
  total_refunded: number | string | null;
  net_paid: number | string | null;
  payment_status: string | null;
};

export type FinanceTransaction = {
  id: string;
  appointment_id: string;
  transaction_type: TransactionType;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  paid_at: string;
  notes: string | null;
  created_at: string;
  booking_reference: string;
  customer_name: string;
  service_id: string;
  service_name: string;
  appointment_status: string;
};

export type FinanceAppointment = {
  appointmentId: string;
  bookingReference: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  startAt: string;
  appointmentStatus: string;
  originalPrice: number;
  amountDue: number;
  discountAmount: number;
  promotionId: string | null;
  discountSource: "promotion" | "custom" | "loyalty" | null;
  discountLabel: string | null;
  discountType: "percentage" | "fixed" | "fixed_discount" | "free_service" | null;
  discountValue: number | null;
  totalPaid: number;
  totalRefunded: number;
  netPaid: number;
  paymentStatus: string;
};

export type FinancePromotion = {
  id: string;
  name: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  service_id: string | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
};
