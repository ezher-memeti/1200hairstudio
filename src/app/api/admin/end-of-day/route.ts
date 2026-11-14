import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getEndOfDay } from "@/lib/finance/end-of-day";

export const dynamic = "force-dynamic";
const chf = (value: number) => `CHF ${value.toFixed(2)}`;

export async function GET(request: NextRequest) {
  try {
    const data = await getEndOfDay(request.nextUrl.searchParams.get("date") ?? "");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText("1200 HAIRSTUDIO", { x: 50, y: 780, size: 24, font: bold });
    page.drawText(`END OF DAY · ${data.date}`, { x: 50, y: 750, size: 12, font: regular, color: rgb(.35,.32,.27) });
    let y = 705;
    const row = (label: string, value: string) => { page.drawText(label, { x: 50, y, size: 10, font: regular }); page.drawText(value, { x: 380, y, size: 10, font: bold }); y -= 22; };
    row("Completed appointments", String(data.appointments.completed)); row("Cancelled appointments", String(data.appointments.cancelled)); row("No-show appointments", String(data.appointments.noShow)); y -= 12;
    row("Gross sales", chf(data.finance.grossRevenue)); row("Discounts", chf(data.finance.discounts)); row("Loyalty redemptions", chf(data.loyaltyRedemptions)); row("Refunds", chf(data.finance.refunds)); row("Tips", chf(data.finance.tips)); row("Net sales", chf(data.finance.netRevenue)); y -= 12;
    row("Cash", chf(data.finance.cash)); row("TWINT", chf(data.finance.twint)); row("Card", chf(data.finance.card)); row("Bank transfer", chf(data.finance.bankTransfer)); row("Other", chf(data.finance.other));
    const register = data.registers.at(-1);
    if (register) { y -= 12; row("Opening cash", chf(register.breakdown.openingCash)); row("Cash in", chf(register.breakdown.deposits)); row("Cash out", chf(register.breakdown.withdrawals)); row("Expected cash", chf(register.expectedCash)); row("Counted cash", register.session.actual_cash == null ? "—" : chf(register.session.actual_cash)); row("Difference", register.session.difference == null ? "—" : chf(register.session.difference)); }
    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="1200-end-of-day-${data.date}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("END OF DAY REPORT ERROR", error);
    return NextResponse.json({ error: "Report could not be generated." }, { status: 500 });
  }
}
