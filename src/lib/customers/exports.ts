import { textFor } from "@/i18n/text";
import { intlLocale } from "@/i18n/config";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatCustomerStatus, getCustomerInsights } from "./status";
import type { AdminCustomerDirectoryEntry } from "./types";
import { getMarketingConsentStatus } from "./marketing-consent";

function formatDate(value: string | null | undefined, locale = "de") {
  return value ? new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

function customerSummary(customer: AdminCustomerDirectoryEntry, now: Date, locale = "de") {
  const insights = getCustomerInsights(customer, now);
  return {
    insights,
    values: [
      customer.full_name,
      customer.email,
      customer.phone,
      customer.type === "registered" ? "Registered" : "Guest",
      formatCustomerStatus(insights.status),
      formatDate(customer.created_at, locale),
      insights.totalBookings,
      insights.completedVisits,
      insights.cancelledAppointments,
      insights.noShows,
      formatDate(insights.lastCompletedAppointment?.start_at, locale),
      formatDate(insights.nextConfirmedAppointment?.start_at, locale),
      insights.favoriteService ?? "-",
      getMarketingConsentStatus(customer).replace("_", " ").toUpperCase(),
      formatDate(customer.marketing_email_consented_at, locale),
      formatDate(customer.marketing_email_unsubscribed_at, locale),
    ],
  };
}

const SUMMARY_HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Type",
  "Status",
  "Customer Since",
  "Total Bookings",
  "Completed Visits",
  "Cancelled",
  "No Shows",
  "Last Visit",
  "Next Appointment",
  "Favorite Service",
  "Marketing Status",
  "Marketing Consent Date",
  "Marketing Unsubscribe Date",
];

export function createAllCustomersCsv(customers: AdminCustomerDirectoryEntry[], now = new Date(), locale = "de") {
  const t = (value: string) => textFor(locale, value);
  return [
    csvRow(SUMMARY_HEADERS.map(t)),
    ...customers.map((customer) => csvRow(customerSummary(customer, now, locale).values)),
  ].join("\r\n");
}

export function createCustomerCsv(customer: AdminCustomerDirectoryEntry, now = new Date(), locale = "de") {
  const t = (value: string) => textFor(locale, value);
  const summary = customerSummary(customer, now, locale);
  const historyHeaders = ["Appointment Service", "Appointment Start", "Appointment End", "Appointment Status"];
  const appointments = customer.appointment_history.length
    ? customer.appointment_history
    : [null];

  return [
    csvRow([...SUMMARY_HEADERS, ...historyHeaders].map(t)),
    ...appointments.map((appointment) =>
      csvRow([
        ...summary.values,
        appointment?.service_name ?? "",
        formatDate(appointment?.start_at),
        formatDate(appointment?.end_at),
        appointment?.status.replace("_", " ").toUpperCase() ?? "",
      ]),
    ),
  ].join("\r\n");
}

type PdfWriter = {
  document: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
  locale: string;
};

function addPage(writer: PdfWriter) {
  if (writer.y !== 0) {
    writer.page = writer.document.addPage([595.28, 841.89]);
  }
  writer.y = 765;
  writer.page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(0.97, 0.97, 0.96) });
  writer.page.drawText("1200", { x: 42, y: 806, size: 18, font: writer.bold, color: rgb(0.82, 0.65, 0.4) });
  writer.page.drawText(textFor(writer.locale, "HAIRSTUDIO  /  CUSTOMER REPORT"), { x: 105, y: 810, size: 8, font: writer.regular, color: rgb(0.38, 0.38, 0.38) });
  writer.page.drawLine({ start: { x: 42, y: 798 }, end: { x: 553, y: 798 }, thickness: 0.7, color: rgb(0.82, 0.65, 0.4) });
}

function ensureSpace(writer: PdfWriter, height = 28) {
  if (writer.y - height < 45) {
    addPage(writer);
  }
}

function drawText(writer: PdfWriter, text: string, options?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number }) {
  ensureSpace(writer, (options?.size ?? 10) + 8);
  writer.page.drawText(text.replace(/[^\x20-\x7E\xA0-\xFF]/g, "-"), {
    x: 42 + (options?.indent ?? 0),
    y: writer.y,
    size: options?.size ?? 10,
    font: options?.bold ? writer.bold : writer.regular,
    color: options?.color ?? rgb(0.12, 0.12, 0.12),
    maxWidth: 510 - (options?.indent ?? 0),
  });
  writer.y -= (options?.size ?? 10) + 8;
}

function drawSection(writer: PdfWriter, title: string) {
  writer.y -= 5;
  drawText(writer, textFor(writer.locale, title).toUpperCase(), { size: 9, bold: true, color: rgb(0.55, 0.4, 0.2) });
}

async function createWriter(locale: string) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const writer = { document, page: document.addPage(), regular, bold, y: 0, locale };
  addPage(writer);
  return writer;
}

export async function createCustomerPdf(customer: AdminCustomerDirectoryEntry, now = new Date(), locale = "de") {
  const t = (value: string) => textFor(locale, value);
  const writer = await createWriter(locale);
  const insights = getCustomerInsights(customer, now);

  drawText(writer, customer.full_name.toUpperCase(), { size: 22, bold: true });
  drawText(writer, `${t(customer.type).toUpperCase()}  /  ${t(formatCustomerStatus(insights.status))}`, { size: 10, bold: true, color: rgb(0.55, 0.4, 0.2) });
  drawSection(writer, "Contact");
  drawText(writer, `${t('Email')}: ${customer.email || "-"}`);
  drawText(writer, `${t('Phone')}: ${customer.phone || "-"}`);
  drawText(writer, `${t('Customer since')}: ${formatDate(customer.created_at, locale)}`);
  drawSection(writer, "Statistics");
  drawText(writer, `${t('Total bookings')}: ${insights.totalBookings}    ${t("Completed")}: ${insights.completedVisits}    ${t("Cancelled")}: ${insights.cancelledAppointments}    ${t("No-shows")}: ${insights.noShows}`);
  drawText(writer, `${t('Last visit')}: ${formatDate(insights.lastCompletedAppointment?.start_at, locale)}`);
  drawText(writer, `${t('Next appointment')}: ${formatDate(insights.nextConfirmedAppointment?.start_at, locale)}`);
  drawText(writer, `${t('Favorite service')}: ${insights.favoriteService ?? "-"}`);
  drawText(writer, `${t('Marketing status')}: ${t(getMarketingConsentStatus(customer).replace("_", " ")).toUpperCase()}`);
  drawText(writer, `${t('Marketing consent date')}: ${formatDate(customer.marketing_email_consented_at, locale)}`);
  drawText(writer, `${t('Marketing unsubscribe date')}: ${formatDate(customer.marketing_email_unsubscribed_at, locale)}`);
  drawSection(writer, "Internal Notes");
  drawText(writer, customer.notes || t("No internal notes."));
  drawSection(writer, "Appointment History");
  if (!customer.appointment_history.length) {
    drawText(writer, t("No appointments."));
  } else {
    customer.appointment_history.forEach((appointment) => {
      drawText(writer, `${formatDate(appointment.start_at, locale)}  |  ${appointment.service_name}  |  ${appointment.status.replace("_", " ").toUpperCase()}`, { size: 9 });
    });
  }

  return writer.document.save();
}

export async function createAllCustomersPdf(customers: AdminCustomerDirectoryEntry[], now = new Date(), locale = "de") {
  const t = (value: string) => textFor(locale, value);
  const writer = await createWriter(locale);
  drawText(writer, t("CUSTOMER DIRECTORY"), { size: 22, bold: true });
  drawText(writer, `${customers.length} customers  /  Generated ${formatDate(now.toISOString())}`, { color: rgb(0.38, 0.38, 0.38) });
  drawSection(writer, "Summary");

  customers.forEach((customer) => {
    const insights = getCustomerInsights(customer, now);
    ensureSpace(writer, 42);
    drawText(writer, `${customer.full_name}  |  ${customer.type.toUpperCase()}  |  ${formatCustomerStatus(insights.status)}`, { size: 10, bold: true });
    drawText(writer, `${customer.email || "-"}  |  Visits ${insights.completedVisits}  |  Last ${formatDate(insights.lastCompletedAppointment?.start_at, locale)}  |  Next ${formatDate(insights.nextConfirmedAppointment?.start_at, locale)}`, { size: 8, color: rgb(0.35, 0.35, 0.35), indent: 8 });
    writer.page.drawLine({ start: { x: 42, y: writer.y + 4 }, end: { x: 553, y: writer.y + 4 }, thickness: 0.3, color: rgb(0.82, 0.82, 0.82) });
    writer.y -= 4;
  });

  return writer.document.save();
}
