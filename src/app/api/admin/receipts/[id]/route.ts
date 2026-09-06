import { requireAdminUser } from "@/lib/auth/customer";
import { generateReceiptPdf, getAdminReceipt } from "@/lib/receipts/server";

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const money = (value: number) => `CHF ${value.toFixed(2)}`;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { supabase } = await requireAdminUser();
  const receipt = await getAdminReceipt(supabase, params.id);
  if (!receipt) return new Response("Receipt not found.", { status: 404 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "view";
  if (format === "pdf") {
    const pdf = await generateReceiptPdf(receipt);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="1200-hairstudio-beleg-${receipt.receipt_number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const date = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(receipt.appointment_start_at));
  const paymentLabel = receipt.payment_method ? `Payment with ${escapeHtml(receipt.payment_method.toUpperCase())}` : "No payment required";
  const autoPrint = format === "print" ? "<script>window.addEventListener('load',()=>window.print())</script>" : "";
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BELEG ${receipt.receipt_number}</title><style>body{margin:0;background:#ece9e1;color:#171715;font:14px Arial,sans-serif}.receipt{box-sizing:border-box;max-width:680px;min-height:100vh;margin:auto;padding:56px 48px;background:#faf8f2}.head{display:flex;justify-content:space-between;border-bottom:1px solid #bba77e;padding-bottom:28px}.brand{font-size:40px;font-weight:800}.small{font-size:10px;letter-spacing:3px;color:#736c60}.number{text-align:right;font-size:18px;font-weight:700}.section{margin-top:34px}.label{font-size:10px;letter-spacing:2px;color:#8a7650}.name{font-size:20px;margin-top:8px}.item,.row{display:flex;justify-content:space-between;gap:24px}.item{margin-top:38px;font-size:16px;font-weight:700}.meta{margin-top:8px;color:#6f6c64}.totals{margin-top:32px;border-top:1px solid #ccc5b8;padding-top:18px}.row{padding:9px 0}.strong{font-weight:700;border-top:1px solid #ccc5b8;margin-top:5px;padding-top:14px}.thanks{margin-top:58px;font-size:16px}.actions{display:flex;gap:10px;margin-top:35px}.actions button{padding:12px 18px;background:#171715;color:#fff;border:0;cursor:pointer}@media print{body{background:#fff}.receipt{max-width:none}.actions{display:none}}@media(max-width:520px){.receipt{padding:32px 22px}.head{gap:20px}.brand{font-size:32px}}</style></head><body><main class="receipt"><header class="head"><div><div class="brand">1200</div><div class="small">HAIRSTUDIO</div><p>Schulstrasse 2<br>8599 Salmsach, Thurgau</p></div><div class="number">BELEG ${receipt.receipt_number}<div class="small" style="margin-top:10px">${escapeHtml(date)}</div></div></header><section class="section"><div class="label">CUSTOMER</div><div class="name">${escapeHtml(receipt.customer_name ?? "Customer")}</div></section><div class="item"><span>${receipt.service_quantity} × ${escapeHtml(receipt.service_name)}</span><span>${money(receipt.subtotal)}</span></div><div class="meta">${escapeHtml(date)}</div><section class="totals"><div class="row"><span>Subtotal</span><span>${money(receipt.subtotal)}</span></div><div class="row"><span>${escapeHtml(receipt.discount_label ?? "Discount")}</span><span>-${money(receipt.discount_amount)}</span></div><div class="row strong"><span>Total</span><span>${money(receipt.total)}</span></div><div class="row"><span>${paymentLabel}</span><span>${money(receipt.amount_paid)}</span></div><div class="row strong"><span>Balance</span><span>${money(receipt.balance)}</span></div></section><p class="thanks">Vielen Dank für Ihren Besuch.</p><div class="actions"><button onclick="window.print()">Print</button></div></main>${autoPrint}</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
