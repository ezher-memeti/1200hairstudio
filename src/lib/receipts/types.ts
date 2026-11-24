export type ReceiptRecord = {
  id: string;
  appointment_id: string;
  receipt_number: number;
  customer_name: string | null;
  service_name: string;
  service_quantity: number;
  appointment_start_at: string;
  subtotal: number;
  discount_amount: number;
  discount_label: string | null;
  total: number;
  tip_amount: number;
  tax_amount: number;
  amount_paid: number;
  balance: number;
  payment_method: string | null;
  currency: string;
  issued_at: string;
  emailed_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type AdminReceipt = ReceiptRecord & {
  customer_email: string;
  customer_id: string | null;
};
