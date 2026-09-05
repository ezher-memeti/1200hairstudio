import type { FinanceTransaction } from "@/lib/finance/types";

export type FinanceRange = "today" | "week" | "month" | "year" | "custom";

export const formatMoney = (value: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(value);
export const dateKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
export const displayDate = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function startForRange(range: FinanceRange, now: Date) {
  const key = dateKey(now);
  const [year, month, day] = key.split("-").map(Number);
  const local = new Date(Date.UTC(year, month - 1, day, 12));
  if (range === "week") local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  if (range === "month") local.setUTCDate(1);
  if (range === "year") { local.setUTCMonth(0); local.setUTCDate(1); }
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

export function transactionCsv(transactions: FinanceTransaction[]) {
  const rows = [["Date", "Booking reference", "Customer", "Service", "Transaction type", "Amount", "Payment method", "Status"], ...transactions.map((item) => [item.paid_at, item.booking_reference, item.customer_name, item.service_name, item.transaction_type, item.amount.toFixed(2), item.payment_method, item.status])];
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

export function downloadTransactionsCsv(transactions: FinanceTransaction[]) {
  const url = URL.createObjectURL(new Blob([transactionCsv(transactions)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `1200-finance-${dateKey(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function EmptyChart({ children = "No data in this range." }: { children?: React.ReactNode }) {
  return <div className="flex min-h-40 items-center justify-center text-center text-sm text-foreground-muted">{children}</div>;
}
