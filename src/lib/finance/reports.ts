import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUtcDateForZurichDateTime } from "@/lib/appointments/availability";
import { FINANCIAL_REPORT_SECTIONS, type FinancialReportGrouping, type FinancialReportPeriodType, type FinancialReportRecord, type FinancialReportRow, type FinancialReportSnapshot, type FinancialReportValues } from "@/lib/finance/report-types";

const FINANCIAL_VALUE_KEYS: Array<keyof FinancialReportValues> = ["grossRevenue", "discounts", "refunds", "netRevenue", "taxes", "totalSales", "giftVoucherRevenue", "serviceFees", "tips", "otherNetSales", "taxOnOtherSales", "otherTotalSales", "totalSalesAndOtherSales", "paidSales", "unpaidSales", "twint", "cash", "card", "bankTransfer", "other", "totalPayments", "paymentsForSalesInPeriod", "paymentsForPreviousPeriods", "paymentPrepayments", "prepaymentRedemptions", "voucherRedemptions", "totalRedemptions", "redemptionsForSalesInPeriod", "redemptionsForPreviousPeriods"];
const ZERO_VALUES: FinancialReportValues = FINANCIAL_VALUE_KEYS.reduce((values, key) => { values[key] = 0; return values; }, {} as FinancialReportValues);
export function safeText(value: unknown): string { return value === null || value === undefined ? "" : String(value); }
export function safeMoney(value: unknown): number { const numeric = Number(value ?? 0); return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0; }
export function safeZurichDateTime(value: unknown): string { const date = new Date(safeText(value)); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(date) : ""; }
const money = safeMoney;
const dateKey = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const monthKey = (value: string) => dateKey(value).slice(0, 7);

export function validateFinancialReportInput(input: { periodType: string; startDate: string; endDate: string; groupBy: string }) {
  const periodTypes = new Set<FinancialReportPeriodType>(["daily", "weekly", "monthly", "yearly", "custom"]);
  const groupings = new Set<FinancialReportGrouping>(["day", "month"]);
  if (!periodTypes.has(input.periodType as FinancialReportPeriodType)) throw new Error("Choose a valid report type.");
  if (!groupings.has(input.groupBy as FinancialReportGrouping)) throw new Error("Choose a valid report grouping.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) throw new Error("Choose a valid report period.");
  return { periodType: input.periodType as FinancialReportPeriodType, startDate: input.startDate, endDate: input.endDate, groupBy: input.groupBy as FinancialReportGrouping };
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function reportUtcBounds(startDate: string, endDate: string) {
  const start = getUtcDateForZurichDateTime(startDate, "00:00");
  const endExclusive = getUtcDateForZurichDateTime(addDays(endDate, 1), "00:00");
  return { start: start.toISOString(), endExclusive: endExclusive.toISOString(), storedEnd: new Date(endExclusive.getTime() - 1).toISOString() };
}

function rowLabel(key: string, groupBy: FinancialReportGrouping) {
  const date = new Date(groupBy === "month" ? `${key}-15T12:00:00Z` : `${key}T12:00:00Z`);
  return new Intl.DateTimeFormat("de-CH", groupBy === "month" ? { month: "long", year: "numeric", timeZone: "UTC" } : { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function rowFor(map: Map<string, FinancialReportRow>, key: string, groupBy: FinancialReportGrouping) {
  const existing = map.get(key);
  if (existing) return existing;
  const row = { key, label: rowLabel(key, groupBy), ...ZERO_VALUES };
  map.set(key, row);
  return row;
}

function finalize(values: FinancialReportValues) {
  values.netRevenue = money(values.grossRevenue - values.discounts - values.refunds);
  values.totalSales = money(values.netRevenue + values.taxes);
  values.otherTotalSales = money(values.otherNetSales + values.taxOnOtherSales);
  values.totalSalesAndOtherSales = money(values.totalSales + values.giftVoucherRevenue + values.serviceFees + values.tips + values.otherTotalSales);
  values.totalPayments = money(values.twint + values.cash + values.card + values.bankTransfer + values.other);
  values.totalRedemptions = money(values.prepaymentRedemptions + values.voucherRedemptions);
  FINANCIAL_VALUE_KEYS.forEach((key) => { values[key] = money(values[key]); });
}

function normalizeValues(value: unknown): FinancialReportValues {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return FINANCIAL_VALUE_KEYS.reduce((result, key) => { result[key] = safeMoney(source[key]); return result; }, { ...ZERO_VALUES });
}

export function normalizeFinancialReportRecord(report: FinancialReportRecord): FinancialReportRecord {
  const rawSnapshot = report.snapshot && typeof report.snapshot === "object" ? report.snapshot as unknown as Record<string, unknown> : {};
  const rawRows = Array.isArray(rawSnapshot.rows) ? rawSnapshot.rows : [];
  const groupBy = safeText(rawSnapshot.groupBy ?? report.group_by) === "month" ? "month" : "day";
  const periodTypeValue = safeText(rawSnapshot.periodType ?? report.period_type);
  const periodType: FinancialReportPeriodType = ["daily", "weekly", "monthly", "yearly", "custom"].includes(periodTypeValue) ? periodTypeValue as FinancialReportPeriodType : "custom";
  const snapshot: FinancialReportSnapshot = {
    version: 2,
    businessName: "1200 Hairstudio",
    address: [safeText((rawSnapshot.address as unknown[] | undefined)?.[0]) || "Schulstrasse 2", safeText((rawSnapshot.address as unknown[] | undefined)?.[1]) || "8599 Salmsach, Thurgau"],
    periodType,
    periodStartDate: safeText(rawSnapshot.periodStartDate),
    periodEndDate: safeText(rawSnapshot.periodEndDate),
    groupBy,
    currency: "CHF",
    totals: normalizeValues(rawSnapshot.totals),
    rows: rawRows.map((row) => {
      const source = row && typeof row === "object" ? row as Record<string, unknown> : {};
      const key = safeText(source.key);
      return { key, label: safeText(source.label) || key, ...normalizeValues(source) };
    }),
  };
  return { ...report, report_number: safeText(report.report_number), period_type: periodType, group_by: groupBy, currency: "CHF", generated_at: safeText(report.generated_at), snapshot };
}

export async function calculateFinancialReport(supabase: SupabaseClient, input: { periodType: FinancialReportPeriodType; startDate: string; endDate: string; groupBy: FinancialReportGrouping }): Promise<FinancialReportSnapshot> {
  const bounds = reportUtcBounds(input.startDate, input.endDate);
  const [{ data: appointments, error: appointmentError }, { data: payments, error: paymentError }] = await Promise.all([
    supabase.from("appointment_finance_summary").select("appointment_id,start_at,appointment_status,original_price,discount_amount,amount_due,net_paid").gte("start_at", bounds.start).lt("start_at", bounds.endExclusive).neq("appointment_status", "cancelled"),
    supabase.from("payments").select("appointment_id,transaction_type,amount,payment_method,status,paid_at").eq("status", "completed").gte("paid_at", bounds.start).lt("paid_at", bounds.endExclusive),
  ]);
  if (appointmentError) throw new Error(`Financial appointments could not be loaded: ${appointmentError.message}`);
  if (paymentError) throw new Error(`Financial payments could not be loaded: ${paymentError.message}`);

  const totals = { ...ZERO_VALUES };
  const rows = new Map<string, FinancialReportRow>();
  for (const appointment of appointments ?? []) {
    const key = input.groupBy === "month" ? monthKey(appointment.start_at) : dateKey(appointment.start_at);
    const row = rowFor(rows, key, input.groupBy);
    const gross = money(appointment.original_price);
    const discount = money(appointment.discount_amount);
    const sale = money(appointment.amount_due);
    const isPaid = money(appointment.net_paid) >= sale;
    totals.grossRevenue += gross; row.grossRevenue += gross;
    totals.discounts += discount; row.discounts += discount;
    if (isPaid) { totals.paidSales += sale; row.paidSales += sale; }
    else { totals.unpaidSales += sale; row.unpaidSales += sale; }
  }
  const paymentAppointmentIds = [...new Set((payments ?? []).map((payment) => payment.appointment_id).filter(Boolean))];
  const { data: paymentAppointments, error: paymentAppointmentsError } = paymentAppointmentIds.length ? await supabase.from("appointments").select("id,start_at").in("id", paymentAppointmentIds) : { data: [], error: null };
  if (paymentAppointmentsError) throw new Error(`Payment appointment periods could not be loaded: ${paymentAppointmentsError.message}`);
  const appointmentStarts = new Map((paymentAppointments ?? []).map((appointment) => [appointment.id, appointment.start_at]));
  for (const payment of payments ?? []) {
    const key = input.groupBy === "month" ? monthKey(payment.paid_at) : dateKey(payment.paid_at);
    const row = rowFor(rows, key, input.groupBy);
    const amount = money(payment.amount);
    if (payment.transaction_type === "refund") { totals.refunds += amount; row.refunds += amount; continue; }
    const method = payment.payment_method === "bank_transfer" ? "bankTransfer" : (["twint", "cash", "card", "other"].includes(payment.payment_method) ? payment.payment_method : "other") as "twint" | "cash" | "card" | "bankTransfer" | "other";
    totals[method] += amount; row[method] += amount;
    const appointmentStart = appointmentStarts.get(payment.appointment_id);
    if (appointmentStart && appointmentStart >= bounds.start && appointmentStart < bounds.endExclusive) { totals.paymentsForSalesInPeriod += amount; row.paymentsForSalesInPeriod += amount; }
    else if (appointmentStart && appointmentStart < bounds.start) { totals.paymentsForPreviousPeriods += amount; row.paymentsForPreviousPeriods += amount; }
  }
  finalize(totals);
  const sortedRows = [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
  sortedRows.forEach(finalize);
  return { version: 2, businessName: "1200 Hairstudio", address: ["Schulstrasse 2", "8599 Salmsach, Thurgau"], periodType: input.periodType, periodStartDate: input.startDate, periodEndDate: input.endDate, groupBy: input.groupBy, currency: "CHF", totals, rows: sortedRows };
}

const chf = (value: unknown) => `CHF ${safeMoney(value).toFixed(2)}`;
function drawRight(page: PDFPage, font: PDFFont, text: unknown, x: number, y: number, size: number) { const value = safeText(text); page.drawText(value, { x: x - font.widthOfTextAtSize(value, size), y, size, font, color: rgb(.12, .12, .11) }); }

export async function generateFinancialReportPdf(report: FinancialReportRecord) {
  report = normalizeFinancialReportRecord(report);
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 1191;
  const pageHeight = 842;
  const margin = 28;
  const periodWidth = 102;
  const generated = safeZurichDateTime(report.generated_at);
  const periodMeta = `From ${safeText(report.snapshot.periodStartDate)} to ${safeText(report.snapshot.periodEndDate)}  |  Grouped by: ${report.group_by === "month" ? "Month" : "Day"}  |  Generated: ${generated}`;
  const reportRows = [{ key: "total", label: "TOTAL", ...report.snapshot.totals }, ...report.snapshot.rows];

  const wrap = (text: unknown, font: PDFFont, size: number, width: number) => {
    const words = safeText(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    words.forEach((word) => { const candidate = line ? `${line} ${word}` : word; if (line && font.widthOfTextAtSize(candidate, size) > width) { lines.push(line); line = word; } else line = candidate; });
    if (line) lines.push(line);
    return lines.slice(0, 4);
  };

  for (const section of FINANCIAL_REPORT_SECTIONS) {
    let page: PDFPage;
    let y = 0;
    const numericWidth = (pageWidth - margin * 2 - periodWidth) / section.columns.length;
    const beginPage = () => {
      page = document.addPage([pageWidth, pageHeight]);
      page.drawText("1200 HAIRSTUDIO", { x: margin, y: pageHeight - 31, size: 11, font: bold, color: rgb(.12, .12, .11) });
      page.drawText("Schulstrasse 2 · 8599 Salmsach, Thurgau", { x: margin, y: pageHeight - 47, size: 7, font: regular, color: rgb(.35, .34, .31) });
      drawRight(page, bold, report.report_number, pageWidth - margin, pageHeight - 31, 10);
      page.drawText(section.title, { x: margin, y: pageHeight - 78, size: 13, font: bold, color: rgb(.43, .32, .17) });
      page.drawText(periodMeta, { x: margin, y: pageHeight - 96, size: 7, font: regular, color: rgb(.34, .33, .3) });
      page.drawLine({ start: { x: margin, y: pageHeight - 107 }, end: { x: pageWidth - margin, y: pageHeight - 107 }, thickness: .7, color: rgb(.62, .56, .46) });
      y = pageHeight - 128;
      page.drawRectangle({ x: margin, y: y - 42, width: pageWidth - margin * 2, height: 42, color: rgb(.92, .91, .87) });
      page.drawText("Period / Datum", { x: margin + 4, y: y - 23, size: 6.2, font: bold });
      section.columns.forEach((column, index) => {
        const right = margin + periodWidth + numericWidth * (index + 1) - 4;
        wrap(column.label, bold, 5.2, numericWidth - 7).forEach((line, lineIndex) => drawRight(page, bold, line, right, y - 11 - lineIndex * 6.2, 5.2));
      });
      y -= 42;
    };
    beginPage();
    reportRows.forEach((row, rowIndex) => {
      if (y - 18 < margin + 18) beginPage();
      const rowFont = rowIndex === 0 ? bold : regular;
      const fill = rowIndex === 0 ? rgb(.96, .94, .89) : rowIndex % 2 === 0 ? rgb(.975, .972, .96) : undefined;
      if (fill) page.drawRectangle({ x: margin, y: y - 18, width: pageWidth - margin * 2, height: 18, color: fill });
      page.drawText(safeText(row.label), { x: margin + 4, y: y - 12, size: 6.3, font: rowFont });
      section.columns.forEach((column, index) => drawRight(page, rowFont, chf(row[column.key]), margin + periodWidth + numericWidth * (index + 1) - 4, y - 12, 6.1));
      page.drawLine({ start: { x: margin, y: y - 18 }, end: { x: pageWidth - margin, y: y - 18 }, thickness: .25, color: rgb(.78, .77, .73) });
      y -= 18;
    });
  }
  return document.save();
}

export function generateFinancialReportCsv(report: FinancialReportRecord) {
  report = normalizeFinancialReportRecord(report);
  const columns = FINANCIAL_REPORT_SECTIONS.flatMap((section) => section.columns);
  const headers = ["Period / Datum", ...columns.map((column) => column.label)];
  const rows = [{ key: "TOTAL", ...report.snapshot.totals }, ...report.snapshot.rows.map(({ key, label: _label, ...values }) => ({ key, ...values }))];
  return [headers, ...rows.map((row) => [safeText(row.key), ...columns.map((column) => safeMoney(row[column.key]))])].map((row) => row.map((cell) => `"${safeText(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}
