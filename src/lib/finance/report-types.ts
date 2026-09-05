export type FinancialReportPeriodType = "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type FinancialReportGrouping = "day" | "month";

export type FinancialReportValues = {
  grossRevenue: number;
  discounts: number;
  refunds: number;
  netRevenue: number;
  taxes: number;
  totalSales: number;
  giftVoucherRevenue: number;
  serviceFees: number;
  tips: number;
  otherNetSales: number;
  taxOnOtherSales: number;
  otherTotalSales: number;
  totalSalesAndOtherSales: number;
  paidSales: number;
  unpaidSales: number;
  twint: number;
  cash: number;
  card: number;
  bankTransfer: number;
  other: number;
  totalPayments: number;
  paymentsForSalesInPeriod: number;
  paymentsForPreviousPeriods: number;
  paymentPrepayments: number;
  prepaymentRedemptions: number;
  voucherRedemptions: number;
  totalRedemptions: number;
  redemptionsForSalesInPeriod: number;
  redemptionsForPreviousPeriods: number;
};

export type FinancialReportRow = FinancialReportValues & { key: string; label: string };

export const FINANCIAL_REPORT_SECTIONS: Array<{ title: string; columns: Array<{ label: string; key: keyof FinancialReportValues }> }> = [
  { title: "SALES / UMSATZ", columns: [
    { label: "Gross revenue / Bruttoumsatz", key: "grossRevenue" }, { label: "Discounts / Rabatte", key: "discounts" }, { label: "Refunds / Erstattungen", key: "refunds" }, { label: "Net revenue / Netto-Umsatz", key: "netRevenue" }, { label: "Taxes / Steuern", key: "taxes" }, { label: "Total sales / Umsatz gesamt", key: "totalSales" }, { label: "Gift voucher revenue", key: "giftVoucherRevenue" }, { label: "Service fees", key: "serviceFees" }, { label: "Tips", key: "tips" }, { label: "Other net sales", key: "otherNetSales" }, { label: "Tax on other sales", key: "taxOnOtherSales" }, { label: "Other total sales", key: "otherTotalSales" }, { label: "Total sales + other sales", key: "totalSalesAndOtherSales" }, { label: "Paid sales in period", key: "paidSales" }, { label: "Unpaid sales in period", key: "unpaidSales" },
  ] },
  { title: "PAYMENTS / ZAHLUNGEN", columns: [
    { label: "TWINT", key: "twint" }, { label: "Cash", key: "cash" }, { label: "Card", key: "card" }, { label: "Bank transfer", key: "bankTransfer" }, { label: "Other", key: "other" }, { label: "Total payments", key: "totalPayments" }, { label: "Payments for sales in selected period", key: "paymentsForSalesInPeriod" }, { label: "Payments for sales from previous periods", key: "paymentsForPreviousPeriods" }, { label: "Prepayments", key: "paymentPrepayments" },
  ] },
  { title: "REDEMPTIONS / EINLÖSUNGEN", columns: [
    { label: "Prepayment redemptions", key: "prepaymentRedemptions" }, { label: "Voucher redemptions", key: "voucherRedemptions" }, { label: "Total redemptions", key: "totalRedemptions" }, { label: "Redemptions for sales in selected period", key: "redemptionsForSalesInPeriod" }, { label: "Redemptions for sales from previous periods", key: "redemptionsForPreviousPeriods" },
  ] },
];

export type FinancialReportSnapshot = {
  version: 1 | 2;
  businessName: string;
  address: [string, string];
  periodType: FinancialReportPeriodType;
  periodStartDate: string;
  periodEndDate: string;
  groupBy: FinancialReportGrouping;
  currency: "CHF";
  totals: FinancialReportValues;
  rows: FinancialReportRow[];
};

export type FinancialReportRecord = {
  id: string;
  report_number: string;
  period_type: FinancialReportPeriodType;
  period_start: string;
  period_end: string;
  group_by: FinancialReportGrouping;
  currency: string;
  snapshot: FinancialReportSnapshot;
  generated_by: string | null;
  generated_at: string;
  created_at: string;
  generated_by_name?: string | null;
};
