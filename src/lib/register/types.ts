import type { PaymentMethodSetting } from "@/lib/admin/settings";

export type RegisterSessionRecord = {
  id: string;
  opened_at: string;
  opened_by: string;
  opening_cash: number | string;
  status: "open" | "closed";
  closed_at: string | null;
  closed_by: string | null;
  expected_cash: number | string | null;
  actual_cash: number | string | null;
  difference: number | string | null;
  opening_note: string | null;
  closing_note: string | null;
  created_at: string;
  updated_at: string;
};

export type RegisterMovementRecord = {
  id: string;
  register_session_id: string;
  type: "deposit" | "withdrawal";
  amount: number | string;
  note: string | null;
  created_by: string;
  created_at: string;
};

export type RegisterPaymentRecord = {
  id: string;
  register_session_id: string;
  appointment_id: string;
  transaction_type: "payment" | "refund";
  amount: number | string;
  tip_amount: number | string | null;
  payment_method: PaymentMethodSetting;
  status: string;
  paid_at: string;
  notes: string | null;
};

export type RegisterBreakdown = {
  openingCash: number;
  cashPayments: number;
  cashTips: number;
  cashRefunds: number;
  deposits: number;
  withdrawals: number;
  calculatedExpectedCash: number;
  paymentMethods: Array<{
    method: PaymentMethodSetting;
    payments: number;
    tips: number;
    refunds: number;
  }>;
};

export type RegisterActivityItem = {
  id: string;
  at: string;
  kind: "opened" | "payment" | "refund" | "deposit" | "withdrawal" | "closed";
  title: string;
  description: string | null;
  amount: number | null;
  paymentMethod: PaymentMethodSetting | null;
  adminLabel: string | null;
  appointmentId: string | null;
  appointmentAt: string | null;
  customerId: string | null;
  customerName: string | null;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
};

export type RegisterSessionDetail = {
  session: Omit<RegisterSessionRecord, "opening_cash" | "expected_cash" | "actual_cash" | "difference"> & {
    opening_cash: number;
    expected_cash: number | null;
    actual_cash: number | null;
    difference: number | null;
  };
  openedByLabel: string;
  closedByLabel: string | null;
  breakdown: RegisterBreakdown;
  expectedCash: number;
  activity: RegisterActivityItem[];
};

export type RegisterPageData = {
  current: RegisterSessionDetail | null;
  history: RegisterSessionDetail[];
  enabledPaymentMethods: PaymentMethodSetting[];
};
