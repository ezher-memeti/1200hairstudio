import type { FinanceAppointment, FinanceTransaction } from "@/lib/finance/types";

export type ComparisonRange = "today" | "week" | "month" | "year" | "custom";
export type ComparisonMetric = "netRevenue" | "grossSales" | "discounts" | "refunds" | "completedAppointments" | "averageTicket" | "totalPayments" | "outstandingAmount";
export type ComparisonTotals = Record<ComparisonMetric, number>;
export type ComparisonPoint = { key: string; label: string; revenue: number; appointments: number; averageTicket: number };
export type FinanceComparison = {
  range: ComparisonRange;
  current: { start: string; end: string; totals: ComparisonTotals; series: ComparisonPoint[] };
  previous: { start: string; end: string; totals: ComparisonTotals; series: ComparisonPoint[] };
  changes: Record<ComparisonMetric, number | null>;
  servicePerformance: Array<{ service: string; current: number; previous: number }>;
  weekdayPerformance: Array<{ label: string; revenue: number; appointments: number }>;
  paymentMethods: Array<{ method: string; amount: number }>;
  recentTransactions: FinanceTransaction[];
  outstandingAppointments: FinanceAppointment[];
};

const dateKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const hourKey = (value: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hour12: false }).format(value);
const parseKey = (key: string) => { const [year, month, day] = key.split("-").map(Number); return new Date(Date.UTC(year, month - 1, day, 12)); };
const formatKey = (value: Date) => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
const addDays = (key: string, days: number) => { const value = parseKey(key); value.setUTCDate(value.getUTCDate() + days); return formatKey(value); };
const daysBetween = (start: string, end: string) => Math.round((parseKey(end).getTime() - parseKey(start).getTime()) / 86_400_000);
const startOfWeek = (key: string) => addDays(key, -((parseKey(key).getUTCDay() + 6) % 7));
const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
const previousMonthStart = (key: string) => { const value = parseKey(monthStart(key)); value.setUTCMonth(value.getUTCMonth() - 1); return formatKey(value); };
const lastDayOfMonth = (key: string) => { const value = parseKey(monthStart(key)); value.setUTCMonth(value.getUTCMonth() + 1); value.setUTCDate(0); return formatKey(value); };
const previousYearDate = (key: string) => { const value = parseKey(key); const month = value.getUTCMonth(); value.setUTCFullYear(value.getUTCFullYear() - 1); if (value.getUTCMonth() !== month) value.setUTCDate(0); return formatKey(value); };

export function resolveComparisonPeriods(range: ComparisonRange, now = new Date(), customStart?: string, customEnd?: string) {
  const today = dateKey(now);
  if (range === "today") return { current: { start: today, end: today }, previous: { start: addDays(today, -1), end: addDays(today, -1) } };
  if (range === "week") { const start = startOfWeek(today); const elapsed = daysBetween(start, today); const previousStart = addDays(start, -7); return { current: { start, end: today }, previous: { start: previousStart, end: addDays(previousStart, elapsed) } }; }
  if (range === "month") { const start = monthStart(today); const previousStart = previousMonthStart(today); const elapsed = daysBetween(start, today); return { current: { start, end: today }, previous: { start: previousStart, end: [addDays(previousStart, elapsed), lastDayOfMonth(previousStart)].sort()[0] } }; }
  if (range === "year") return { current: { start: `${today.slice(0, 4)}-01-01`, end: today }, previous: { start: `${Number(today.slice(0, 4)) - 1}-01-01`, end: previousYearDate(today) } };
  const start = customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart) ? customStart : today;
  const end = customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) && customEnd >= start ? customEnd : start;
  const duration = daysBetween(start, end) + 1;
  return { current: { start, end }, previous: { start: addDays(start, -duration), end: addDays(start, -1) } };
}

function inPeriod(value: string, period: { start: string; end: string }) { const key = dateKey(new Date(value)); return key >= period.start && key <= period.end; }
function axis(range: ComparisonRange, period: { start: string; end: string }) {
  if (range === "today") return Array.from({ length: 24 }, (_, index) => ({ key: String(index).padStart(2, "0"), label: `${String(index).padStart(2, "0")}:00` }));
  if (range === "week") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => ({ key: String(index), label }));
  if (range === "month") return Array.from({ length: Number(lastDayOfMonth(period.start).slice(-2)) }, (_, index) => ({ key: String(index + 1), label: String(index + 1) }));
  if (range === "year") return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label, index) => ({ key: String(index), label }));
  return Array.from({ length: daysBetween(period.start, period.end) + 1 }, (_, index) => ({ key: String(index), label: addDays(period.start, index).slice(5) }));
}
function position(range: ComparisonRange, value: string, period: { start: string; end: string }) {
  const date = new Date(value); const key = dateKey(date);
  if (range === "today") return String(Number(hourKey(date)));
  if (range === "week") return String((parseKey(key).getUTCDay() + 6) % 7);
  if (range === "month") return String(Number(key.slice(-2)));
  if (range === "year") return String(Number(key.slice(5, 7)) - 1);
  return String(daysBetween(period.start, key));
}

function aggregatePeriod(range: ComparisonRange, period: { start: string; end: string }, transactions: FinanceTransaction[], appointments: FinanceAppointment[], maxPosition?: number) {
  const withinElapsedPosition = (value: string) => maxPosition === undefined || Number(position(range, value, period)) <= maxPosition;
  const periodTransactions = transactions.filter((item) => item.status === "completed" && inPeriod(item.paid_at, period) && withinElapsedPosition(item.paid_at));
  const periodAppointments = appointments.filter((item) => inPeriod(item.startAt, period) && withinElapsedPosition(item.startAt));
  const completedAppointments = periodAppointments.filter((item) => item.appointmentStatus === "completed");
  const payments = periodTransactions.filter((item) => item.transaction_type === "payment");
  const refunds = periodTransactions.filter((item) => item.transaction_type === "refund");
  const paymentIds = new Set(payments.map((item) => item.appointment_id));
  const totalPayments = payments.reduce((sum, item) => sum + item.amount, 0);
  const refundTotal = refunds.reduce((sum, item) => sum + item.amount, 0);
  const netRevenue = totalPayments - refundTotal;
  const totals: ComparisonTotals = { netRevenue, grossSales: completedAppointments.reduce((sum, item) => sum + item.originalPrice, 0), discounts: completedAppointments.reduce((sum, item) => sum + item.discountAmount, 0), refunds: refundTotal, completedAppointments: completedAppointments.length, averageTicket: paymentIds.size ? netRevenue / paymentIds.size : 0, totalPayments, outstandingAmount: periodAppointments.reduce((sum, item) => sum + Math.max(0, item.amountDue - item.netPaid), 0) };
  const points = new Map(axis(range, period).map((item) => [item.key, { ...item, revenue: 0, appointments: 0, paid: 0, paidIds: new Set<string>() }]));
  periodTransactions.forEach((item) => { const point = points.get(position(range, item.paid_at, period)); if (!point) return; point.revenue += item.transaction_type === "payment" ? item.amount : -item.amount; if (item.transaction_type === "payment") { point.paid += item.amount; point.paidIds.add(item.appointment_id); } });
  completedAppointments.forEach((item) => { const point = points.get(position(range, item.startAt, period)); if (point) point.appointments += 1; });
  return { totals, series: [...points.values()].map(({ key, label, revenue, appointments, paid, paidIds }) => ({ key, label, revenue, appointments, averageTicket: paidIds.size ? paid / paidIds.size : 0 })), transactions: periodTransactions };
}

export function calculateFinanceComparison(input: { range: ComparisonRange; customStart?: string; customEnd?: string; now?: Date; transactions: FinanceTransaction[]; appointments: FinanceAppointment[] }): FinanceComparison {
  const now = input.now ?? new Date();
  const periods = resolveComparisonPeriods(input.range, now, input.customStart, input.customEnd);
  const current = aggregatePeriod(input.range, periods.current, input.transactions, input.appointments);
  const previous = aggregatePeriod(input.range, periods.previous, input.transactions, input.appointments, input.range === "today" ? Number(hourKey(now)) : undefined);
  const changes = Object.fromEntries((Object.keys(current.totals) as ComparisonMetric[]).map((key) => [key, previous.totals[key] === 0 ? null : ((current.totals[key] - previous.totals[key]) / previous.totals[key]) * 100])) as Record<ComparisonMetric, number | null>;
  const serviceNames = new Set([...current.transactions, ...previous.transactions].map((item) => item.service_name));
  const serviceTotal = (items: FinanceTransaction[], service: string) => items.filter((item) => item.service_name === service).reduce((sum, item) => sum + (item.transaction_type === "payment" ? item.amount : -item.amount), 0);
  const servicePerformance = [...serviceNames].map((service) => ({ service, current: serviceTotal(current.transactions, service), previous: serviceTotal(previous.transactions, service) })).sort((a, b) => b.current - a.current);
  const weekdayPerformance = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => { const appointments = input.appointments.filter((item) => inPeriod(item.startAt, periods.current) && item.appointmentStatus === "completed" && ((parseKey(dateKey(new Date(item.startAt))).getUTCDay() + 6) % 7) === index); const appointmentIds = new Set(appointments.map((item) => item.appointmentId)); const revenue = current.transactions.filter((item) => appointmentIds.has(item.appointment_id)).reduce((sum, item) => sum + (item.transaction_type === "payment" ? item.amount : -item.amount), 0); return { label, revenue, appointments: appointments.length }; });
  const paymentMethods = Object.entries(current.transactions.filter((item) => item.transaction_type === "payment").reduce<Record<string, number>>((result, item) => { result[item.payment_method] = (result[item.payment_method] ?? 0) + item.amount; return result; }, {})).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);
  const outstandingAppointments = input.appointments.filter((item) => inPeriod(item.startAt, periods.current) && item.amountDue > item.netPaid).sort((a, b) => (b.amountDue - b.netPaid) - (a.amountDue - a.netPaid));
  return { range: input.range, current: { ...periods.current, totals: current.totals, series: current.series }, previous: { ...periods.previous, totals: previous.totals, series: previous.series }, changes, servicePerformance, weekdayPerformance, paymentMethods, recentTransactions: current.transactions.slice(0, 8), outstandingAppointments };
}
