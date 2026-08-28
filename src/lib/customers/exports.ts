import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatCustomerStatus, getCustomerInsights } from "./status";
import type { AdminCustomerDirectoryEntry } from "./types";

const ZURICH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(value: string | null | undefined) {
  return value ? ZURICH_FORMATTER.format(new Date(value)) : "-";
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

function customerSummary(customer: AdminCustomerDirectoryEntry, now: Date) {
  const insights = getCustomerInsights(customer, now);
  return {
    insights,
    values: [
      customer.full_name,
      customer.email,
      customer.phone,
      customer.type === "registered" ? "Registered" : "Guest",
      formatCustomerStatus(insights.status),
      formatDate(customer.created_at),
      insights.totalBookings,
      insights.completedVisits,
      insights.cancelledAppointments,
      insights.noShows,
      formatDate(insights.lastCompletedAppointment?.start_at),
      formatDate(insights.nextConfirmedAppointment?.start_at),
      insights.favoriteService ?? "-",
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
];

export function createAllCustomersCsv(customers: AdminCustomerDirectoryEntry[], now = new Date()) {
  return [
    csvRow(SUMMARY_HEADERS),
    ...customers.map((customer) => csvRow(customerSummary(customer, now).values)),
  ].join("\r\n");
}

export function createCustomerCsv(customer: AdminCustomerDirectoryEntry, now = new Date()) {
  const summary = customerSummary(customer, now);
  const historyHeaders = ["Appointment Service", "Appointment Start", "Appointment End", "Appointment Status"];
  const appointments = customer.appointment_history.length
    ? customer.appointment_history
    : [null];

  return [
    csvRow([...SUMMARY_HEADERS, ...historyHeaders]),
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
};

function addPage(writer: PdfWriter) {
  if (writer.y !== 0) {
    writer.page = writer.document.addPage([595.28, 841.89]);
  }
  writer.y = 765;
  writer.page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(0.97, 0.97, 0.96) });
  writer.page.drawText("1200", { x: 42, y: 806, size: 18, font: writer.bold, color: rgb(0.82, 0.65, 0.4) });
  writer.page.drawText("HAIRSTUDIO  /  CUSTOMER REPORT", { x: 105, y: 810, size: 8, font: writer.regular, color: rgb(0.38, 0.38, 0.38) });
  writer.page.drawLine({ start: { x: 42, y: 798 }, end: { x: 553, y: 798 }, thickness: 0.7, color: rgb(0.82, 0.65, 0.4) });
}

function ensureSpace(writer: PdfWriter, height = 28) {
  if (writer.y - height < 45) {
    addPage(writer);
  }
}

function drawText(writer: PdfWriter, text: string, options?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number }) {
  ensureSpace(writer, (options?.size ?? 10) + 8);
  writer.page.drawText(text.replace(/[^\x20-\x7E]/g, "-"), {
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
  drawText(writer, title.toUpperCase(), { size: 9, bold: true, color: rgb(0.55, 0.4, 0.2) });
}

async function createWriter() {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const writer = { document, page: document.addPage(), regular, bold, y: 0 };
  addPage(writer);
  return writer;
}

export async function createCustomerPdf(customer: AdminCustomerDirectoryEntry, now = new Date()) {
  const writer = await createWriter();
  const insights = getCustomerInsights(customer, now);

  drawText(writer, customer.full_name.toUpperCase(), { size: 22, bold: true });
  drawText(writer, `${customer.type.toUpperCase()}  /  ${formatCustomerStatus(insights.status)}`, { size: 10, bold: true, color: rgb(0.55, 0.4, 0.2) });
  drawSection(writer, "Contact");
  drawText(writer, `Email: ${customer.email || "-"}`);
  drawText(writer, `Phone: ${customer.phone || "-"}`);
  drawText(writer, `Customer since: ${formatDate(customer.created_at)}`);
  drawSection(writer, "Statistics");
  drawText(writer, `Total bookings: ${insights.totalBookings}    Completed: ${insights.completedVisits}    Cancelled: ${insights.cancelledAppointments}    No-shows: ${insights.noShows}`);
  drawText(writer, `Last visit: ${formatDate(insights.lastCompletedAppointment?.start_at)}`);
  drawText(writer, `Next appointment: ${formatDate(insights.nextConfirmedAppointment?.start_at)}`);
  drawText(writer, `Favorite service: ${insights.favoriteService ?? "-"}`);
  drawSection(writer, "Internal Notes");
  drawText(writer, customer.notes || "No internal notes.");
  drawSection(writer, "Appointment History");
  if (!customer.appointment_history.length) {
    drawText(writer, "No appointments.");
  } else {
    customer.appointment_history.forEach((appointment) => {
      drawText(writer, `${formatDate(appointment.start_at)}  |  ${appointment.service_name}  |  ${appointment.status.replace("_", " ").toUpperCase()}`, { size: 9 });
    });
  }

  return writer.document.save();
}

export async function createAllCustomersPdf(customers: AdminCustomerDirectoryEntry[], now = new Date()) {
  const writer = await createWriter();
  drawText(writer, "CUSTOMER DIRECTORY", { size: 22, bold: true });
  drawText(writer, `${customers.length} customers  /  Generated ${formatDate(now.toISOString())}`, { color: rgb(0.38, 0.38, 0.38) });
  drawSection(writer, "Summary");

  customers.forEach((customer) => {
    const insights = getCustomerInsights(customer, now);
    ensureSpace(writer, 42);
    drawText(writer, `${customer.full_name}  |  ${customer.type.toUpperCase()}  |  ${formatCustomerStatus(insights.status)}`, { size: 10, bold: true });
    drawText(writer, `${customer.email || "-"}  |  Visits ${insights.completedVisits}  |  Last ${formatDate(insights.lastCompletedAppointment?.start_at)}  |  Next ${formatDate(insights.nextConfirmedAppointment?.start_at)}`, { size: 8, color: rgb(0.35, 0.35, 0.35), indent: 8 });
    writer.page.drawLine({ start: { x: 42, y: writer.y + 4 }, end: { x: 553, y: writer.y + 4 }, thickness: 0.3, color: rgb(0.82, 0.82, 0.82) });
    writer.y -= 4;
  });

  return writer.document.save();
}
