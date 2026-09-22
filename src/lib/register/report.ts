import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { RegisterSessionDetail } from "@/lib/register/types";

const chf = (value: number) => `CHF ${value.toFixed(2)}`;
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const methodLabel = (value: string) => value.replaceAll("_", " ").toUpperCase();

function drawRight(page: PDFPage, font: PDFFont, text: string, y: number, size = 10) {
  page.drawText(text, { x: 535 - font.widthOfTextAtSize(text, size), y, size, font, color: rgb(0.1, 0.1, 0.1) });
}

export async function generateRegisterClosingPdf(detail: RegisterSessionDetail) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.97, 0.96, 0.93) });
  page.drawText("1200", { x: 50, y: 782, size: 30, font: bold });
  page.drawText("H A I R S T U D I O", { x: 52, y: 765, size: 7, font: regular, color: rgb(0.35, 0.33, 0.29) });
  drawRight(page, bold, "REGISTER CLOSING REPORT", 782, 14);
  drawRight(page, regular, detail.session.id, 763, 7);
  let y = 720;
  const heading = (value: string) => { page.drawText(value, { x: 50, y, size: 8, font: bold, color: rgb(0.45, 0.35, 0.2) }); y -= 22; };
  const row = (label: string, value: string, strong = false) => { page.drawText(label, { x: 50, y, size: strong ? 10 : 9, font: strong ? bold : regular }); drawRight(page, strong ? bold : regular, value, y, strong ? 10 : 9); y -= 18; };
  heading("SESSION");
  row("Opened", dateTime(detail.session.opened_at)); row("Closed", dateTime(detail.session.closed_at));
  row("Opened by", detail.openedByLabel); row("Closed by", detail.closedByLabel ?? "Admin"); y -= 10;
  heading("OPENING CASH"); row("Opening amount", chf(detail.breakdown.openingCash)); y -= 10;
  heading("PAYMENTS");
  detail.breakdown.paymentMethods.forEach((item) => { row(`${methodLabel(item.method)} payments`, chf(item.payments)); if (item.tips) row(`${methodLabel(item.method)} tips`, chf(item.tips)); if (item.refunds) row(`${methodLabel(item.method)} refunds`, `-${chf(item.refunds)}`); });
  y -= 10; heading("CASH MOVEMENTS"); row("Deposits", chf(detail.breakdown.deposits)); row("Withdrawals", `-${chf(detail.breakdown.withdrawals)}`); y -= 10;
  heading("RECONCILIATION");
  row("Opening cash", chf(detail.breakdown.openingCash)); row("Cash payments", chf(detail.breakdown.cashPayments)); row("Cash tips", chf(detail.breakdown.cashTips)); row("Cash refunds", `-${chf(detail.breakdown.cashRefunds)}`); row("Deposits", chf(detail.breakdown.deposits)); row("Withdrawals", `-${chf(detail.breakdown.withdrawals)}`);
  page.drawLine({ start: { x: 50, y: y + 7 }, end: { x: 535, y: y + 7 }, thickness: 0.7, color: rgb(0.75, 0.7, 0.6) });
  row("Expected physical cash", chf(detail.expectedCash), true); row("Actual counted cash", chf(detail.session.actual_cash ?? 0), true); row("Difference", chf(detail.session.difference ?? 0), true);
  const difference = detail.session.difference ?? 0;
  row("Status", difference < 0 ? "SHORT" : difference > 0 ? "OVER" : "BALANCED", true);
  if (detail.session.closing_note) { y -= 8; heading("CLOSING / DISCREPANCY NOTE"); page.drawText(detail.session.closing_note.slice(0, 100), { x: 50, y, size: 9, font: regular }); }
  page.drawText("Opening cash and register movements are drawer values, not revenue.", { x: 50, y: 35, size: 7, font: regular, color: rgb(0.4, 0.4, 0.38) });
  return document.save();
}

export function registerReportHtml(detail: RegisterSessionDetail, autoPrint: boolean) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const difference = detail.session.difference ?? 0;
  const status = difference < 0 ? "SHORT" : difference > 0 ? "OVER" : "BALANCED";
  const rows = (items: Array<[string, string]>) => items.map(([label, value]) => `<div class="row"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("");
  const paymentRows = detail.breakdown.paymentMethods.flatMap((item) => [[`${methodLabel(item.method)} payments`, chf(item.payments)], ...(item.tips ? [[`${methodLabel(item.method)} tips`, chf(item.tips)]] : []), ...(item.refunds ? [[`${methodLabel(item.method)} refunds`, `-${chf(item.refunds)}`]] : [])] as Array<[string,string]>);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Register Closing Report</title><style>body{margin:0;background:#ece9e1;color:#171715;font:14px Arial,sans-serif}.report{box-sizing:border-box;max-width:760px;min-height:100vh;margin:auto;padding:50px;background:#faf8f2}.head{display:flex;justify-content:space-between;gap:30px;border-bottom:1px solid #bba77e;padding-bottom:25px}.brand{font-size:38px;font-weight:800}.small{font-size:9px;letter-spacing:2px;color:#736c60}.right{text-align:right}section{margin-top:28px}h2{font-size:10px;letter-spacing:2px;color:#806a40}.row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;border-bottom:1px solid #e2ddd2}.total{font-size:16px}.note{padding:14px;background:#eee9df}.actions{margin-top:30px}.actions button{padding:12px 18px;background:#171715;color:#fff;border:0}@media print{body{background:#fff}.report{max-width:none}.actions{display:none}}@media(max-width:560px){.report{padding:28px 20px}.head{display:block}.right{text-align:left;margin-top:20px}}</style></head><body><main class="report"><header class="head"><div><div class="brand">1200</div><div class="small">HAIRSTUDIO</div></div><div class="right"><strong>REGISTER CLOSING REPORT</strong><div class="small" style="margin-top:8px">${escape(detail.session.id)}</div></div></header><section><h2>SESSION</h2>${rows([["Opened",dateTime(detail.session.opened_at)],["Closed",dateTime(detail.session.closed_at)],["Opened by",detail.openedByLabel],["Closed by",detail.closedByLabel??"Admin"]])}</section><section><h2>OPENING CASH</h2>${rows([["Opening amount",chf(detail.breakdown.openingCash)]])}</section><section><h2>PAYMENTS</h2>${rows(paymentRows)}</section><section><h2>CASH MOVEMENTS</h2>${rows([["Deposits",chf(detail.breakdown.deposits)],["Withdrawals",`-${chf(detail.breakdown.withdrawals)}`]])}</section><section><h2>RECONCILIATION</h2>${rows([["Opening cash",chf(detail.breakdown.openingCash)],["Cash payments",chf(detail.breakdown.cashPayments)],["Cash refunds",`-${chf(detail.breakdown.cashRefunds)}`],["Deposits",chf(detail.breakdown.deposits)],["Withdrawals",`-${chf(detail.breakdown.withdrawals)}`],["Expected physical cash",chf(detail.expectedCash)],["Actual counted cash",chf(detail.session.actual_cash??0)],["Difference",chf(difference)],["Status",status]])}</section>${detail.session.closing_note?`<section><h2>CLOSING / DISCREPANCY NOTE</h2><p class="note">${escape(detail.session.closing_note)}</p></section>`:""}<p class="small" style="margin-top:28px">Opening cash and register movements are drawer values, not revenue.</p><div class="actions"><button onclick="window.print()">Print</button></div></main>${autoPrint?"<script>window.addEventListener('load',()=>window.print())</script>":""}</body></html>`;
}
